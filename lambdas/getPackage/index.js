const semver = require("semver");

const get_package_files = require("./get_package_files.js");

function has_compatible_version(versions = [], semver_range) {
  if (versions.length == 0) {
    return false;
  }
  return versions.some((version) => semver.satisfies(version, semver_range));
}

async function get_all_files(
  name,
  version,
  preinstalled_packages,
  response = {}
) {
  if (
    preinstalled_packages[name] &&
    has_compatible_version(preinstalled_packages[name], version)
  ) {
    return response;
  }

  if (
    response[name] &&
    has_compatible_version(Object.keys(response[name]), version)
  ) {
    return response;
  }

  if (!response[name]) {
    response[name] = {};
  }

  let [payload, meta] = await get_package_files(name, version);
  const dependencies = meta.Dependencies;

  response[name][meta.PackageVersion] = {
    payload,
    dependencies,
  };

  for (const dependency in dependencies) {
    response = get_all_files(
      dependency,
      dependencies[dependency],
      preinstalled_packages,
      response
    );
  }

  return response;
}

exports.handler = async (event) => {
  const name = event.headers["X-PackageName"];
  const version = event.headers["X-PackageVersion"];
  const body = event.body ? JSON.parse(event.body) : {};

  try {
    return {
      statusCode: 200,
      body: JSON.stringify(await get_all_files(name, version, body)),
    };
  } catch (err) {
    return {
      statusCode: err.statusCode || 500,
      body: JSON.stringify({
        message: `${err}`,
      }),
    };
  }
};
