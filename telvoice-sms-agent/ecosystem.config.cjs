/** PM2: siempre arrancar desde esta carpeta (evita servir dist obsoleto de otro path). */
const path = require("node:path");

module.exports = {
  apps: [
    {
      name: "telvoice-sms-agent",
      script: path.join(__dirname, "dist/index.js"),
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
