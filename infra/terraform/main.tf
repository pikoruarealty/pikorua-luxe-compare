locals {
  prefix = "propcompare-${var.environment}"
  labels = {
    application = "propcompare"
    environment = var.environment
    managed_by  = "terraform"
  }
  runtime_roles = toset([
    "roles/artifactregistry.reader",
    "roles/logging.logWriter",
    "roles/monitoring.metricWriter",
    "roles/pubsub.publisher",
    "roles/secretmanager.secretAccessor",
  ])
  deploy_roles = toset([
    "roles/artifactregistry.writer",
    "roles/compute.instanceAdmin.v1",
    "roles/compute.osAdminLogin",
    "roles/iap.tunnelResourceAccessor",
  ])
}

resource "google_project_service" "required" {
  for_each = toset([
    "artifactregistry.googleapis.com",
    "bigquery.googleapis.com",
    "compute.googleapis.com",
    "iamcredentials.googleapis.com",
    "iap.googleapis.com",
    "logging.googleapis.com",
    "monitoring.googleapis.com",
    "pubsub.googleapis.com",
    "secretmanager.googleapis.com",
    "storage.googleapis.com",
    "sts.googleapis.com",
  ])
  project            = var.project_id
  service            = each.value
  disable_on_destroy = false
}

resource "google_artifact_registry_repository" "containers" {
  depends_on    = [google_project_service.required]
  location      = var.region
  repository_id = "propcompare"
  description   = "Immutable PropCompare production images"
  format        = "DOCKER"
  labels        = local.labels
  cleanup_policy_dry_run = true
}

resource "google_storage_bucket" "access_logs" {
  depends_on                  = [google_project_service.required]
  name                        = "${var.project_id}-propcompare-access-logs"
  location                    = var.region
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = false
  labels                      = local.labels
  versioning { enabled = true }
}

resource "google_storage_bucket" "source_evidence" {
  depends_on                  = [google_project_service.required]
  name                        = "${var.project_id}-propcompare-source-evidence"
  location                    = var.region
  storage_class               = "STANDARD"
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = false
  labels                      = local.labels
  versioning { enabled = true }
  logging {
    log_bucket        = google_storage_bucket.access_logs.name
    log_object_prefix = "source-evidence/"
  }
  lifecycle_rule {
    condition { days_since_noncurrent_time = 365 }
    action {
      type          = "SetStorageClass"
      storage_class = "ARCHIVE"
    }
  }
}

data "google_storage_project_service_account" "gcs" {}

resource "google_storage_bucket_iam_member" "access_log_writer" {
  bucket = google_storage_bucket.access_logs.name
  role   = "roles/storage.objectCreator"
  member = "serviceAccount:${data.google_storage_project_service_account.gcs.email_address}"
}

resource "google_storage_bucket" "approved_media" {
  depends_on                  = [google_project_service.required]
  name                        = "${var.project_id}-propcompare-approved-media"
  location                    = var.region
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = false
  labels                      = local.labels
  versioning { enabled = true }
  cors {
    origin          = var.monitored_host == "" ? [] : ["https://${var.monitored_host}"]
    method          = ["GET", "HEAD"]
    response_header = ["Content-Type", "ETag"]
    max_age_seconds = 3600
  }
}

resource "google_service_account" "runtime" {
  account_id   = "propcompare-runtime"
  display_name = "PropCompare production runtime"
}

resource "google_project_iam_member" "runtime" {
  for_each = local.runtime_roles
  project  = var.project_id
  role     = each.value
  member   = "serviceAccount:${google_service_account.runtime.email}"
}

resource "google_storage_bucket_iam_member" "runtime_source" {
  bucket = google_storage_bucket.source_evidence.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.runtime.email}"
}

resource "google_storage_bucket_iam_member" "runtime_media" {
  bucket = google_storage_bucket.approved_media.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.runtime.email}"
}

resource "google_secret_manager_secret" "application_env" {
  for_each  = toset(["propcompare-web-env", "propcompare-ocr-env"])
  secret_id = each.value
  labels    = local.labels
  replication { auto {} }
}

resource "google_compute_address" "web" {
  depends_on = [google_project_service.required]
  name       = "${local.prefix}-web"
  region     = var.region
}

resource "google_compute_instance" "web" {
  depends_on   = [google_project_service.required]
  name         = "${local.prefix}-web"
  machine_type = var.vm_machine_type
  zone         = var.zone
  tags         = ["propcompare-web"]
  labels       = local.labels

  boot_disk {
    auto_delete = true
    initialize_params {
      image = "projects/debian-cloud/global/images/family/debian-12"
      size  = var.vm_boot_disk_gb
      type  = "pd-balanced"
    }
  }

  network_interface {
    network = "default"
    access_config { nat_ip = google_compute_address.web.address }
  }

  metadata = {
    enable-oslogin         = "TRUE"
    block-project-ssh-keys = "TRUE"
  }
  metadata_startup_script = templatefile("${path.module}/startup.sh.tftpl", {})

  service_account {
    email  = google_service_account.runtime.email
    scopes = ["cloud-platform"]
  }

  shielded_instance_config {
    enable_secure_boot          = true
    enable_vtpm                 = true
    enable_integrity_monitoring = true
  }

  scheduling {
    automatic_restart   = true
    on_host_maintenance = "MIGRATE"
  }

  allow_stopping_for_update = true
  deletion_protection       = true
}

resource "google_compute_firewall" "web" {
  name    = "${local.prefix}-web"
  network = "default"
  direction = "INGRESS"
  target_tags = ["propcompare-web"]
  source_ranges = ["0.0.0.0/0"]
  allow {
    protocol = "tcp"
    ports    = ["80", "443"]
  }
}

resource "google_compute_firewall" "iap_ssh" {
  name          = "${local.prefix}-iap-ssh"
  network       = "default"
  direction     = "INGRESS"
  target_tags   = ["propcompare-web"]
  source_ranges = ["35.235.240.0/20"]
  allow {
    protocol = "tcp"
    ports    = ["22"]
  }
}

resource "google_pubsub_topic" "product_events" {
  depends_on = [google_project_service.required]
  name       = "propcompare-product-events"
  labels     = local.labels
  message_retention_duration = "604800s"
}

resource "google_bigquery_dataset" "analytics" {
  depends_on                 = [google_project_service.required]
  dataset_id                 = "propcompare_analytics"
  location                   = var.region
  description                = "Pseudonymous product analytics; customer PII remains in Supabase"
  default_partition_expiration_ms = 7776000000
  delete_contents_on_destroy = false
  labels                     = local.labels
}

resource "google_bigquery_table" "raw_events" {
  dataset_id          = google_bigquery_dataset.analytics.dataset_id
  table_id            = "raw_product_events"
  deletion_protection = true
  schema               = file("${path.module}/../../ops/bigquery/product-events.schema.json")
  time_partitioning {
    type          = "DAY"
    field         = "occurredAt"
    expiration_ms = 7776000000
  }
  clustering = ["eventName", "profileId"]
  labels     = local.labels
}

data "google_project" "current" { project_id = var.project_id }

resource "google_project_iam_member" "pubsub_bigquery_writer" {
  project = var.project_id
  role    = "roles/bigquery.dataEditor"
  member  = "serviceAccount:service-${data.google_project.current.number}@gcp-sa-pubsub.iam.gserviceaccount.com"
}

resource "google_pubsub_subscription" "product_events_bigquery" {
  depends_on = [google_project_iam_member.pubsub_bigquery_writer]
  name       = "propcompare-product-events-bigquery"
  topic      = google_pubsub_topic.product_events.id
  retain_acked_messages      = false
  message_retention_duration = "604800s"
  expiration_policy { ttl = "" }
  bigquery_config {
    table            = "${var.project_id}.${google_bigquery_dataset.analytics.dataset_id}.${google_bigquery_table.raw_events.table_id}"
    use_table_schema = true
  }
}

resource "google_iam_workload_identity_pool" "github" {
  provider                  = google-beta
  workload_identity_pool_id = "propcompare-github"
  display_name              = "PropCompare GitHub Actions"
}

resource "google_iam_workload_identity_pool_provider" "github" {
  provider                           = google-beta
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github"
  display_name                       = "GitHub OIDC"
  attribute_mapping = {
    "google.subject"       = "assertion.sub"
    "attribute.repository" = "assertion.repository"
    "attribute.ref"        = "assertion.ref"
  }
  attribute_condition = "assertion.repository == '${var.github_repository}'"
  oidc { issuer_uri = "https://token.actions.githubusercontent.com" }
}

resource "google_service_account" "github_deploy" {
  account_id   = "propcompare-github-deploy"
  display_name = "PropCompare GitHub production deployer"
}

resource "google_service_account_iam_member" "github_oidc" {
  service_account_id = google_service_account.github_deploy.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository/${var.github_repository}"
}

resource "google_project_iam_member" "github_deploy" {
  for_each = local.deploy_roles
  project  = var.project_id
  role     = each.value
  member   = "serviceAccount:${google_service_account.github_deploy.email}"
}

resource "google_service_account_iam_member" "github_runtime_user" {
  service_account_id = google_service_account.runtime.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.github_deploy.email}"
}

resource "google_monitoring_uptime_check_config" "health" {
  count        = var.monitored_host == "" ? 0 : 1
  display_name = "PropCompare public health"
  timeout      = "10s"
  period       = "60s"
  http_check {
    path         = "/healthz"
    port         = 443
    use_ssl      = true
    validate_ssl = true
  }
  monitored_resource {
    type   = "uptime_url"
    labels = { project_id = var.project_id, host = var.monitored_host }
  }
}

resource "google_monitoring_alert_policy" "uptime" {
  count        = var.monitored_host == "" ? 0 : 1
  display_name = "PropCompare production unavailable"
  combiner     = "OR"
  notification_channels = var.alert_notification_channels
  conditions {
    display_name = "Health check fails"
    condition_threshold {
      filter          = "metric.type=\"monitoring.googleapis.com/uptime_check/check_passed\" AND resource.type=\"uptime_url\" AND metric.label.check_id=\"${google_monitoring_uptime_check_config.health[0].uptime_check_id}\""
      comparison      = "COMPARISON_LT"
      threshold_value = 1
      duration        = "120s"
      aggregations {
        alignment_period   = "60s"
        per_series_aligner = "ALIGN_FRACTION_TRUE"
      }
    }
  }
}
