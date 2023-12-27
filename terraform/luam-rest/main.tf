# Create the REST API

resource "aws_api_gateway_rest_api" "luam_rest" {
  name = "luam-rest-api"
}

# Define the /packages path

module "slash_packages" {
  source = "../resource-module"
  api    = aws_api_gateway_rest_api.luam_rest
  name   = "packages"
}

# Define /packages request validators

resource "aws_api_gateway_request_validator" "validate_body_only" {
  # name must be alphanumeric, so camelCase is used.
  name                        = "validateBodyOnly"
  rest_api_id                 = aws_api_gateway_rest_api.luam_rest.id
  validate_request_body       = true
  validate_request_parameters = false
}

resource "aws_api_gateway_request_validator" "validate_request_parameters_only" {
  # name must be alphanumeric, so camelCase is used.
  name                        = "validateParametersOnly"
  rest_api_id                 = aws_api_gateway_rest_api.luam_rest.id
  validate_request_body       = false
  validate_request_parameters = true
}

# 
# Define POST /packages
# 

resource "aws_api_gateway_model" "post_package_body_model" {
  rest_api_id = aws_api_gateway_rest_api.luam_rest.id
  # name must be alphanumeric, so camelCase is used.
  name         = "postPackageBodyModel"
  description  = "The schema for posting package"
  content_type = "application/json"

  schema = jsonencode({
    type = "object"
    properties = {
      name = {
        type      = "string"
        minLength = 1
      }
      version = {
        type      = "string"
        minLength = 5
      }
      dependencies = {
        type = "object"
        additionalProperties = {
          type = "string"
        }
      }
      payload = {
        type      = "string"
        minLength = 4
      }
    }
    required = ["name", "version", "dependencies", "payload"]
  })
}

resource "aws_api_gateway_method" "post_package" {
  rest_api_id          = aws_api_gateway_rest_api.luam_rest.id
  resource_id          = module.slash_packages.resource.id
  request_validator_id = aws_api_gateway_request_validator.validate_body_only.id
  http_method          = "POST"
  authorization        = "NONE"

  request_models = {
    "application/json" = aws_api_gateway_model.post_package_body_model.name
  }
}

# 
# Define GET /packages
# 

resource "aws_api_gateway_model" "get_package_body_model" {
  rest_api_id = aws_api_gateway_rest_api.luam_rest.id

  name         = "getPackageBodyModel"
  description  = "The schema for installing a package"
  content_type = "application/json"

  schema = jsonencode({
    type = "object"
    additionalProperties = {
      type = "array",
      "items" : {
        "type" : "string"
      }
    }
  })
}

resource "aws_api_gateway_method" "get_package" {
  rest_api_id          = aws_api_gateway_rest_api.luam_rest.id
  resource_id          = module.slash_packages.resource.id
  request_validator_id = aws_api_gateway_request_validator.validate_request_parameters_only.id
  http_method          = "GET"
  authorization        = "NONE"

  request_models = {
    "application/json" = aws_api_gateway_model.get_package_body_model.name
  }

  request_parameters = {
    "method.request.header.X-PackageName" = true
  }
}

# Used for fetching the account ID dynamically

data "aws_caller_identity" "current" {}

# Provision POST /packages lambda and it's required permissions

module "post_package_execution_role" {
  source = "../lambda-policy"
  name   = "postPackage"
  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Action = [
          "s3:PutObject",
          "dynamodb:Query",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
        ],
        Effect = "Allow",
        Resource = [
          "arn:aws:s3:::luam-package-files/*",
          "arn:aws:s3:::luam-package-files",
          "arn:aws:dynamodb:us-west-2:${data.aws_caller_identity.current.account_id}:table/luam_package_metadata"
        ]
      }
    ]
  })
}

module "post_package_lambda" {
  depends_on = [module.slash_packages]

  source        = "../lambda-module"
  name          = "postPackage"
  rest_api      = aws_api_gateway_rest_api.luam_rest
  resource_id   = module.slash_packages.resource.id
  client_method = "POST"
  role_arn      = module.post_package_execution_role.role_arn
}

# Provision GET /packages lambda and it's required permissions

module "get_package_execution_role" {
  source = "../lambda-policy"
  name   = "getPackage"
  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Action = [
          "s3:*",
          "logs:*",
          "dynamodb:Query",
        ],
        Effect = "Allow",
        Resource = [
          "arn:aws:s3:::luam-package-files/*",
          "arn:aws:s3:::luam-package-files",
          "arn:aws:dynamodb:us-west-2:${data.aws_caller_identity.current.account_id}:table/luam_package_metadata"
        ]
      }
    ]
  })
}

module "get_package_lambda" {
  depends_on = [module.slash_packages]

  source        = "../lambda-module"
  name          = "getPackage"
  rest_api      = aws_api_gateway_rest_api.luam_rest
  resource_id   = module.slash_packages.resource.id
  client_method = "GET"
  role_arn      = module.get_package_execution_role.role_arn
}

# Deploy the API

resource "aws_api_gateway_deployment" "luam_rest_deployment" {
  depends_on = [module.post_package_lambda, module.get_package_lambda]

  rest_api_id = aws_api_gateway_rest_api.luam_rest.id

  triggers = {
    redeployment = sha1(jsonencode(aws_api_gateway_rest_api.luam_rest.body))
  }

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_api_gateway_stage" "luam_rest_stage" {
  deployment_id = aws_api_gateway_deployment.luam_rest_deployment.id
  rest_api_id   = aws_api_gateway_rest_api.luam_rest.id
  stage_name    = "main"
}
