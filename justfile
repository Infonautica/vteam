default:
    @just --list

build:
    npm run build

dev *args:
    npx tsx src/bin.ts {{args}}

test:
    npx vitest run

test-watch:
    npx vitest

lint:
    npx tsc --noEmit
    npx eslint src/

clean:
    rm -rf dist
