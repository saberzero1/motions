default:
	just --list

bump version:
	npm_package_version={{version}} node version-bump.mjs
	npm i -D

tag version:
	git tag -a "{{version}}" -m "Release version {{version}}"
	git push origin tag "{{version}}"
