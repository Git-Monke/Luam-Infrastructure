variable "api" {
  description = "A reference to the api to add the resource to"
  type        = any
}

variable "parent_resource_id" {
  description = "The id of the parent of the path being created. If attatching to the root, this will be api.root_resource_id"
  type        = string
}

variable "name" {
  description = "The name of the resource to add"
  type        = string
}
