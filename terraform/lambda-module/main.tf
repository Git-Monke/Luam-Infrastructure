resource "aws_lambda_function" "lambda" {
  filename      = "../lambda_payloads/${var.name}.zip"
  function_name = var.name
  role          = var.role_arn
  handler       = "index.handler"
  timeout       = 15

  source_code_hash = data.archive_file.archive.output_base64sha256

  runtime = "nodejs16.x"
}

resource "aws_lambda_permission" "lambda_permissions" {
  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.lambda.function_name
  principal     = "apigateway.amazonaws.com"

  source_arn = "${var.rest_api.execution_arn}/*/*"
}

data "archive_file" "archive" {
  type        = "zip"
  source_dir  = "../lambdas/${var.name}"
  output_path = "../lambda_payloads/${var.name}.zip"
}

resource "aws_api_gateway_integration" "integration" {
  rest_api_id = var.rest_api.id
  resource_id = var.resource_id
  http_method = var.client_method

  integration_http_method = var.integration_method
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.lambda.invoke_arn
}
