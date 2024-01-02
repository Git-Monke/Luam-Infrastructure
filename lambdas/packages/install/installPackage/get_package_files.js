const zlib = require("zlib");
const semver = require("semver");

const get_package_meta = require("./get_package_meta.js");
const { s3 } = require("./AWSClients.js");

async function get_files(name, version) {
  const params = {
    Bucket: "luam-package-files",
    Key: `${name}/${name}-${version}.gz`,
  };

  const data = await s3.getObject(params).promise();
  const uncompressedData = zlib.gunzipSync(data.Body);
  const payload = uncompressedData.toString("base64");

  return payload;
}

async function get_package_files(name, version) {
  if (!semver.valid(version) && semver.validRange(version)) {
    const meta = await get_package_meta(name, "0.0.0");
    // In this case, version is actually a semver version range
    version = meta.Versions.reverse().find((_version) =>
      semver.satisfies(_version, version)
    );
  }

  if (!version) {
    const meta = await get_package_meta(name, "0.0.0");
    version = meta.Versions[meta.Versions.length - 1];
  }

  return [
    await get_files(name, version),
    await get_package_meta(name, version),
  ];
}

module.exports = get_package_files;
