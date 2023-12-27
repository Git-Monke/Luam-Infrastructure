resource "aws_api_gateway_resource" "resource" {
  rest_api_id = var.api.id
  parent_id   = var.parent_resource_id
  path_part   = var.name
}
