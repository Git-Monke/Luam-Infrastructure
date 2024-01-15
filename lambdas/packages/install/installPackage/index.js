const semver = require("semver");

const get_package_files = require("./get_package_files.js");

function find_compatible_version(versions = [], semver_range) {
  if (versions.length == 0) {
    return false;
  }

  return versions.find((version) => semver.satisfies(version, semver_range));
}

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
  if (!response[name]) {
    response[name] = {};
  }

  let [payload, meta] = await get_package_files(name, version);
  const dependencies = meta.Dependencies;

  let package_data = {
    payload,
    dependencies,
    providedDependencyVersions: {},
  };

  response[name][meta.PackageVersion] = package_data;

  for (const package_name of Object.keys(response)) {
    for (const package_version of Object.keys(response[package_name])) {
      const other_package = response[package_name][package_version];
      const depends_on_version = other_package["dependencies"][name];

      if (
        depends_on_version &&
        semver.satisfies(meta.PackageVersion, depends_on_version)
      ) {
        other_package.providedDependencyVersions[name] = meta.PackageVersion;
      }
    }
  }

  for (const dependency in dependencies) {
    const preinstalled_compatible_version = find_compatible_version(
      preinstalled_packages[dependency] || [],
      dependencies[dependency]
    );

    if (preinstalled_compatible_version) {
      package_data.providedDependencyVersions[dependency] =
        preinstalled_compatible_version;
      continue;
    }

    if (
      response[dependency] &&
      has_compatible_version(
        Object.keys(response[dependency]),
        dependencies[dependency]
      )
    ) {
      continue;
    }

    response = await get_all_files(
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
