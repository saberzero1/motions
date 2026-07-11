default:
    just --list

bump version:
    npm run lint
    npm_package_version={{version}} node version-bump.mjs
    npm i -D
    prettier . --check --write

tag version:
    git tag -a "{{version}}" -m "Release version {{version}}"
    git push origin tag "{{version}}"
