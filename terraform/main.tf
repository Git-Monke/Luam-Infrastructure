terraform {
  backend "s3" {
    bucket         = "luam-terraform-state"
    key            = "tf-infra/terraform.tfstate"
    region         = "us-west-2"
    dynamodb_table = "luam_terraform_state_lock"
    encrypt        = true
  }

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 3.0"
    }
  }
}

provider "aws" {
  region = "us-west-2"
}

variable "Authorization" {
  type        = map(string)
  description = "All of the secrets used in making calls to different API's"
}

# Provisioning for storing the terraform.tfstate and lock information.

resource "aws_s3_bucket" "terraform_state" {
  bucket        = "luam-terraform-state"
  force_destroy = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "encryption" {
  bucket = aws_s3_bucket.terraform_state.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_dynamodb_table" "terraform_locks" {
  name         = "luam_terraform_state_lock"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "LockID"
  attribute {
    name = "LockID"
    type = "S"
  }
}

# Provisioning for storing luam package files and package metadata

resource "aws_s3_bucket" "luam_package_files_s3" {
  bucket = "luam-package-files"
}

resource "aws_dynamodb_table" "luam_package_metadata" {
  name         = "luam_package_metadata"
  billing_mode = "PAY_PER_REQUEST"

  hash_key  = "PackageName"
  range_key = "PackageVersion"

  attribute {
    name = "PackageName"
    type = "S"
  }

  attribute {
    name = "PackageVersion"
    type = "S"
  }
}

resource "aws_dynamodb_table" "luam_users" {
  name         = "luam_users"
  billing_mode = "PAY_PER_REQUEST"

  hash_key = "UserID"

  attribute {
    name = "UserID"
    type = "N"
  }
}

resource "aws_dynamodb_table" "luam_api_tokens" {
  name         = "luam_api_tokens"
  billing_mode = "PAY_PER_REQUEST"

  hash_key  = "UserID"
  range_key = "TokenIDHash"

  attribute {
    name = "UserID"
    type = "N"
  }

  attribute {
    name = "TokenIDHash"
    type = "S"
  }

  global_secondary_index {
    name            = "TokenIDHash-index"
    hash_key        = "TokenIDHash"
    projection_type = "ALL"
  }
}

# Create the luam rest api

variable "redeploy_gateway" {
  type    = bool
  default = false
}

module "luam_rest" {
  source          = "./luam-rest"
  redploy_gateway = var.redeploy_gateway
  Authorization   = var.Authorization
}
