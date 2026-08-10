.PHONY: release

release:
	@read -p "Versão a ser lançada (ex: 1.2.3): " version; \
	if [ -z "$$version" ]; then echo "Versão vazia, abortando."; exit 1; fi; \
	npm version $$version --no-git-tag-version; \
	git add package.json package-lock.json; \
	git commit -m "chore: release v$$version"; \
	git tag "v$$version"; \
	git push origin main; \
	git push origin "v$$version"
