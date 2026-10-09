# UNO Online — Frontend

Standalone React, TypeScript, and Vite client for the multiplayer UNO game.

## Local development

```sh
npm ci
npm run dev
```

Set `VITE_SERVER_URL` in `.env.local` to the deployed backend URL when testing against a separately deployed server. For example:

```env
VITE_SERVER_URL=https://your-backend-host.example.com
```

When that variable is unset, Vite proxies Socket.IO traffic to `http://localhost:3001` for local development.

## Build and deployment

Run `npm ci` and `npm run build`. Deploy this folder as the frontend repository/root directory and publish the generated `dist` directory. Configure `VITE_SERVER_URL` as a build-time environment variable with the public URL of the backend, including `https://` (or `http://` for local development). Build again after changing it.

The backend URL can be left out of source control; `.env.example` is only a template.
