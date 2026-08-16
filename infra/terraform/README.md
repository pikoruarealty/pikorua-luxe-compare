# Production GCP foundation

This stack declares production infrastructure but intentionally does not contain credentials,
secret versions, DNS, TLS certificates, a billing account, or legal/launch approval. Store remote
Terraform state in a separately protected GCS bucket before the first apply.

1. Copy `terraform.tfvars.example` to an untracked `terraform.tfvars`.
2. Run `terraform fmt -check`, `terraform init`, `terraform validate`, and review `terraform plan`.
3. Apply only through an owner-approved infrastructure workflow.
4. Add secret *versions* for `propcompare-web-env` and `propcompare-ocr-env` out of band.
5. Set the Terraform outputs as protected GitHub production variables/secrets.
6. Install TLS, `/opt/propcompare/.env.deploy`, the Ops Agent config and systemd unit as described
   in `ops/README.md` before the first application deployment.

The source/evidence bucket has no expiry. Older noncurrent versions move to Archive storage after
one year but are not deleted. The BigQuery raw event table enforces a 90-day partition expiry.
Configure `ops/bigquery/retention.sql` as an owner-reviewed daily scheduled query for 24-month
non-identifying aggregates.
