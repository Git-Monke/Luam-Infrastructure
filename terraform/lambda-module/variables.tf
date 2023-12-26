variable "name" {
  description = "The name of the lambda function"
  type        = string
}

variable "rest_api" {
  description = "A reference to the rest api to integrate with"
  type        = any
}

variable "resource_id" {
  description = "The id of the resource to integrate with"
  type        = string
}

variable "client_method" {
  description = "The method that the client uses to call the API Gateway"
  type        = string
}

variable "integration_method" {
  description = "The method that the API Gateway uses to call the lambda"
  type        = string
  default     = "POST"
}

variable "role_arn" {
  description = "The role that the lambda assumes"
  type        = string
}
