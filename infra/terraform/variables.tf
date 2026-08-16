variable "project_id" {
  description = "Dedicated GCP production project ID."
  type        = string
}

variable "region" {
  description = "India region for production data and compute."
  type        = string
  default     = "asia-south1"
}

variable "zone" {
  type    = string
  default = "asia-south1-a"
}

variable "environment" {
  type    = string
  default = "production"
  validation {
    condition     = var.environment == "production"
    error_message = "This stack is intentionally production-only."
  }
}

variable "github_repository" {
  description = "GitHub repository in owner/name format allowed to deploy."
  type        = string
}

variable "vm_machine_type" {
  type    = string
  default = "e2-standard-4"
}

variable "vm_boot_disk_gb" {
  type    = number
  default = 50
}

variable "monitored_host" {
  description = "Production DNS host. Leave empty until DNS and TLS exist."
  type        = string
  default     = ""
}

variable "alert_notification_channels" {
  description = "Existing Cloud Monitoring notification-channel resource names."
  type        = list(string)
  default     = []
}
