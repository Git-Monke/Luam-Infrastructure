# Create the REST API

resource "aws_api_gateway_rest_api" "luam_rest" {
  name = "luam-rest-api"
}

# Define the /packages path

module "slash_packages" {
  source             = "../resource-module"
  api                = aws_api_gateway_rest_api.luam_rest
  parent_resource_id = aws_api_gateway_rest_api.luam_rest.root_resource_id
  name               = "packages"
}

# Define the /packages/install path

module "slash_install" {
  source             = "../resource-module"
  api                = aws_api_gateway_rest_api.luam_rest
  parent_resource_id = module.slash_packages.resource.id
  name               = "install"
}

# Define the /signup path

module "slash_signup" {
  source             = "../resource-module"
  api                = aws_api_gateway_rest_api.luam_rest
  parent_resource_id = aws_api_gateway_rest_api.luam_rest.root_resource_id
  name               = "signup"
}

module "slash_tokens" {
  source             = "../resource-module"
  api                = aws_api_gateway_rest_api.luam_rest
  parent_resource_id = aws_api_gateway_rest_api.luam_rest.root_resource_id
  name               = "tokens"
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

resource "aws_api_gateway_request_validator" "validate_everything" {
  # name must be alphanumeric, so camelCase is used.
  name                        = "validateEverything"
  rest_api_id                 = aws_api_gateway_rest_api.luam_rest.id
  validate_request_body       = true
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

  request_parameters = {
    "method.request.header.Authorization" = true
  }

  request_models = {
    "application/json" = aws_api_gateway_model.post_package_body_model.name
  }
}

# 
# Define POST /packages/install
# 

resource "aws_api_gateway_model" "install_package_body_model" {
  rest_api_id = aws_api_gateway_rest_api.luam_rest.id

  name         = "installPackageBodyModel"
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

resource "aws_api_gateway_method" "install_package" {
  rest_api_id          = aws_api_gateway_rest_api.luam_rest.id
  resource_id          = module.slash_install.resource.id
  request_validator_id = aws_api_gateway_request_validator.validate_everything.id
  http_method          = "POST"
  authorization        = "NONE"

  request_models = {
    "application/json" = aws_api_gateway_model.install_package_body_model.name
  }

  request_parameters = {
    "method.request.header.X-PackageName" = true
  }
}

#
# Define POST /signup
#

resource "aws_api_gateway_method" "post_signup" {
  rest_api_id          = aws_api_gateway_rest_api.luam_rest.id
  resource_id          = module.slash_signup.resource.id
  request_validator_id = aws_api_gateway_request_validator.validate_request_parameters_only.id
  http_method          = "POST"
  authorization        = "NONE"

  request_parameters = {
    "method.request.header.X-Code" = true
  }
}

#
# Define POST /tokens
#

resource "aws_api_gateway_model" "post_token_body_model" {
  rest_api_id = aws_api_gateway_rest_api.luam_rest.id

  name         = "postTokenBodyModel"
  description  = "The body model for posting a new api token"
  content_type = "application/json"

  schema = jsonencode({
    type = "object"
    properties = {
      expirationDate = {
        type = "number"
      },
      namePattern = {
        type = "string"
      },
      allowedUses = {
        type = "number"
      },
      name = {
        type = "string"
      }
      scopes = {
        type = "object",
        properties = {
          "publish-new" : {
            type = "boolean"
          }
          "publish-update" : {
            type = "boolean"
          }
          "change-owners" : {
            type = "boolean"
          }
          "yank" : {
            type = "boolean"
          }
        }
        required = ["publish-new", "publish-update", "change-owners", "yank"]
      }
    }
    required = ["scopes", "name"]
  })
}

resource "aws_api_gateway_method" "post_token" {
  rest_api_id          = aws_api_gateway_rest_api.luam_rest.id
  resource_id          = module.slash_tokens.resource.id
  request_validator_id = aws_api_gateway_request_validator.validate_everything.id
  http_method          = "POST"
  authorization        = "NONE"

  request_models = {
    "application/json" = aws_api_gateway_model.post_token_body_model.name
  }

  request_parameters = {
    "method.request.header.Authorization" = true
  }
}

#
# Define DELETE /tokens
#

resource "aws_api_gateway_method" "delete_token" {
  rest_api_id          = aws_api_gateway_rest_api.luam_rest.id
  resource_id          = module.slash_tokens.resource.id
  request_validator_id = aws_api_gateway_request_validator.validate_request_parameters_only.id
  http_method          = "DELETE"
  authorization        = "NONE"

  request_parameters = {
    "method.request.header.Authorization" = true
    "method.request.header.TokenIDHash"   = true
  }
}

#
# Define GET /tokens
#

resource "aws_api_gateway_method" "get_token" {
  rest_api_id          = aws_api_gateway_rest_api.luam_rest.id
  resource_id          = module.slash_tokens.resource.id
  request_validator_id = aws_api_gateway_request_validator.validate_request_parameters_only.id
  http_method          = "GET"
  authorization        = "NONE"

  request_parameters = {
    "method.request.header.Authorization" = true
  }
}

# Used for fetching the account ID dynamically

data "aws_caller_identity" "current" {}

# Provision POST /packages lambda and its required permissions

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
          "logs:*"
        ],
        Effect = "Allow",
        Resource = [
          "arn:aws:s3:::luam-package-files/*",
          "arn:aws:s3:::luam-package-files",
          "arn:aws:dynamodb:us-west-2:${data.aws_caller_identity.current.account_id}:table/luam_package_metadata",
          "arn:aws:logs:*:*:*"
        ]
      },
      {
        Action = [
          "dynamodb:Query"
        ],
        Effect = "Allow",
        Resource = [
          "arn:aws:dynamodb:us-west-2:${data.aws_caller_identity.current.account_id}:table/luam_api_tokens/*/*"
        ]
      }
    ]
  })
}

module "post_package_lambda" {
  depends_on = [module.slash_packages]

  source        = "../lambda-module"
  resource_path = "packages"
  name          = "postPackage"
  rest_api      = aws_api_gateway_rest_api.luam_rest
  resource_id   = module.slash_packages.resource.id
  client_method = "POST"
  role_arn      = module.post_package_execution_role.role_arn
}

# Provision POST /packages/install lambda and its required permissions

module "install_package_execution_role" {
  source = "../lambda-policy"
  name   = "installPackage"
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
          "arn:aws:dynamodb:us-west-2:${data.aws_caller_identity.current.account_id}:table/luam_package_metadata",
          "arn:aws:logs:*:*:*"
        ]
      }
    ]
  })
}

module "install_package_lambda" {
  depends_on = [module.slash_packages]

  source        = "../lambda-module"
  resource_path = "packages/install"
  name          = "installPackage"
  rest_api      = aws_api_gateway_rest_api.luam_rest
  resource_id   = module.slash_install.resource.id
  client_method = "POST"
  role_arn      = module.install_package_execution_role.role_arn
}

# Provision POST /tokens lambda

module "post_token_execution_role" {
  source = "../lambda-policy"
  name   = "postToken"
  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Action = [
          "logs:*",
          "dynamodb:PutItem"
        ],
        Effect = "Allow",
        Resource = [
          "arn:aws:dynamodb:us-west-2:${data.aws_caller_identity.current.account_id}:table/luam_api_tokens",
          "arn:aws:logs:*:*:*"
        ]
      }
    ]
  })
}

module "post_token_lambda" {
  depends_on = [module.slash_tokens]

  source        = "../lambda-module"
  resource_path = "tokens"
  name          = "postToken"
  rest_api      = aws_api_gateway_rest_api.luam_rest
  resource_id   = module.slash_tokens.resource.id
  client_method = "POST"
  role_arn      = module.post_token_execution_role.role_arn
}

# Provision DELETE /tokens lambda

module "delete_token_execution_role" {
  source = "../lambda-policy"
  name   = "deleteToken"
  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Action = [
          "logs:*",
          "dynamodb:UpdateItem"
        ],
        Effect = "Allow",
        Resource = [
          "arn:aws:dynamodb:us-west-2:${data.aws_caller_identity.current.account_id}:table/luam_api_tokens",
          "arn:aws:logs:*:*:*"
        ]
      }
    ]
  })
}

module "delete_token_lambda" {
  depends_on = [module.slash_tokens]

  source        = "../lambda-module"
  resource_path = "tokens"
  name          = "deleteToken"
  rest_api      = aws_api_gateway_rest_api.luam_rest
  resource_id   = module.slash_tokens.resource.id
  client_method = "DELETE"
  role_arn      = module.delete_token_execution_role.role_arn
}

module "get_token_execution_role" {
  source = "../lambda-policy"
  name   = "getTokens"
  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Action = [
          "logs:*",
          "dynamodb:Query"
        ],
        Effect = "Allow",
        Resource = [
          "arn:aws:dynamodb:us-west-2:${data.aws_caller_identity.current.account_id}:table/luam_api_tokens",
          "arn:aws:logs:*:*:*"
        ]
      }
    ]
  })
}

module "get_token_lambda" {
  depends_on = [module.slash_tokens]

  source        = "../lambda-module"
  resource_path = "tokens"
  name          = "getTokens"
  rest_api      = aws_api_gateway_rest_api.luam_rest
  resource_id   = module.slash_tokens.resource.id
  client_method = "GET"
  role_arn      = module.get_token_execution_role.role_arn
}

# Provision POST /signup and its required permissions

module "post_signup_execution_role" {
  source = "../lambda-policy"
  name   = "postSignup"
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = [
          "dynamodb:Query",
          "dynamodb:PutItem",
          "logs:*",
        ],
        Effect = "Allow",
        Resource = [
          "arn:aws:dynamodb:us-west-2:${data.aws_caller_identity.current.account_id}:table/luam_users",
          "arn:aws:logs:*:*:*"
        ]
      }
    ]
  })
}

module "post_signup_lambda" {
  depends_on = [module.slash_signup]

  source        = "../lambda-module"
  resource_path = "signup"
  name          = "postSignup"
  rest_api      = aws_api_gateway_rest_api.luam_rest
  resource_id   = module.slash_signup.resource.id
  client_method = "POST"
  role_arn      = module.post_signup_execution_role.role_arn
}

# Deploy the API

variable "redploy_gateway" {
  type    = bool
  default = false
}

resource "aws_api_gateway_deployment" "luam_rest_deployment" {
  depends_on = [module.post_package_lambda, module.install_package_lambda, module.post_signup_lambda]

  rest_api_id = aws_api_gateway_rest_api.luam_rest.id

  triggers = {
    redeployment = "dont_redeploy"
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
