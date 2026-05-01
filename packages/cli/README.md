# fin14

Budget CLI for static sites. Measures and validates page weight against the 14 kB limit.

## Install

```bash
npm install -D fin14
# or experiment without installing:
npx fin14 dist/
```

## Usage

```bash
fin14 dist/               # measure and validate all pages
fin14 audit dist/index.html   # detailed report for one page
fin14 dev dist/           # watch mode with live report page
```

## License

MIT
