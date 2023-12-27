const semver = require("semver");

const get_package_files = require("./get_package_files.js");

async function get_all_files(name, version, response = {}) {
  if (
    response[name] &&
    Object.keys(response[name]).some((other_version) =>
      semver.satisfies(other_version, version)
    )
  ) {
    return response;
  }

  if (!response[name]) {
    response[name] = {};
  }

  let [payload, meta] = await get_package_files(name, version);
  const dependencies = meta.Dependencies;
  console.log(payload, meta);

  response[name][meta.PackageVersion] = {
    payload,
    dependencies,
  };

  for (const dependency in dependencies) {
    response = get_all_files(dependency, dependencies[dependency], response);
  }

  return response;
}

exports.handler = async (event) => {
  const name = event.headers["X-PackageName"];
  const version = event.headers["X-PackageVersion"];

  try {
    return await get_all_files(name, version);
  } catch (err) {
    return {
      statusCode: err.statusCode || 500,
      body: JSON.stringify({
        message: `${err}`,
      }),
    };
  }
};
