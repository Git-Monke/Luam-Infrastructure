variable "policy" {
  description = "The json encoded policy granting necessary permissions"
  type        = string
}

variable "name" {
  description = "The name of the lambda function. Used for naming the IAM role."
  type        = string
}
