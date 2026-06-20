# Dreamweave Client

Dreamweave pure web client built with Three.js. It is a static frontend that connects to a Dreamweave Server API; it does not include or start a game server.

## Development

```powershell
npm install
npm run dev
```

Open the Vite URL, normally:

```text
http://127.0.0.1:7776
```

The client can run without a server in offline exploration mode. For local development, `/api` is proxied to the Dreamweave Server at `http://127.0.0.1:7777`. If you deploy the static build elsewhere, enter an API Base URL in the connection dialog that points to a compatible Dreamweave Server API.

## Build

```powershell
npm run build
```

The production output in `dist/` is static HTML/CSS/JS. Deploy it behind the same origin as the Dreamweave Server API, or configure an API base URL that is allowed by the server's CORS policy.

## License

GPL-2.0-only. Runtime dependencies are MIT-licensed packages compatible with this project license.
