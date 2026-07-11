import { readFileSync, writeFileSync } from 'fs';

const targetVersion = process.env.npm_package_version;

// read minAppVersion from manifest.json and bump version to target version
let manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));
const { minAppVersion } = manifest;
manifest.version = targetVersion;
writeFileSync('manifest.json', JSON.stringify(manifest, null, '\t'));

// update versions.json with target version and minAppVersion from manifest.json
let versions = JSON.parse(readFileSync('versions.json', 'utf8'));
versions[targetVersion] = minAppVersion;
writeFileSync('versions.json', JSON.stringify(versions, null, '\t'));

// update package.json with target version
let packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
packageJson.version = targetVersion;
writeFileSync('package.json', JSON.stringify(packageJson, null, '\t'));

// update CHANGELOG.md with header for target version
// turns:
//
// ## [Unreleased]
//
// Into:
//
// ## [Unreleased]
//
// ## [targetVersion] - YYYY-MM-DD
let changelog = readFileSync('CHANGELOG.md', 'utf8');
const today = new Date().toISOString().split('T')[0];
const unreleasedHeader = '## [Unreleased]';
const newVersionHeader = `## [${targetVersion}] - ${today}`;
changelog = changelog.replace(
    unreleasedHeader,
    `${unreleasedHeader}\n\n${newVersionHeader}`,
);
writeFileSync('CHANGELOG.md', changelog);
