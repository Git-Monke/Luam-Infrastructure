output "api" {
  value = aws_api_gateway_rest_api.luam_rest.id
}

output "deployment" {
  value = aws_api_gateway_deployment.luam_rest_deployment
}
