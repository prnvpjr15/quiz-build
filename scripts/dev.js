#!/usr/bin/env node
//
// One command to run the whole project: `npm run dev`.
//
// Starts the API and the frontend dev server together, installs the client's
// dependencies if they are missing, and steps around ports that are already
// taken by something else. Prints exactly one URL to open.
const net = require("node:net");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const CLIENT = path.join(ROOT, "client");

// Both tools are launched as plain scripts under the current Node binary
// rather than through their npm shims: on Windows those shims are .cmd files,
// which recent Node refuses to spawn without a shell, and going through a
// shell then requires escaping every argument.
const NODEMON = path.join(ROOT, "node_modules", "nodemon", "bin", "nodemon.js");
const VITE = path.join(CLIENT, "node_modules", "vite", "bin", "vite.js");

function canBind(port, host) {
	return new Promise((resolve) => {
		const server = net.createServer();

		server.once("error", () => resolve(false));
		server.once("listening", () => server.close(() => resolve(true)));

		if (host) server.listen(port, host);
		else server.listen(port);
	});
}

// Checked on both loopback and all interfaces, because either alone gives a
// false "free":
//
//   - a Docker port mapping holds 0.0.0.0, which a loopback probe misses
//   - Vite binds only 127.0.0.1, which an all-interfaces probe misses
//
// Windows lets the complementary bind succeed in each case, so the server then
// dies with EADDRINUSE after this said the port was available.
async function isPortFree(port) {
	return (await canBind(port, "127.0.0.1")) && (await canBind(port));
}

async function findFreePort(preferred, label) {
	for (let port = preferred; port < preferred + 25; port += 1) {
		if (await isPortFree(port)) {
			if (port !== preferred) {
				console.log(`  ${label}: port ${preferred} is taken, using ${port}`);
			}
			return port;
		}
	}

	throw new Error(`No free port for ${label} near ${preferred}.`);
}

function waitForServer(port, timeoutMs = 40000) {
	const deadline = Date.now() + timeoutMs;

	return new Promise((resolve) => {
		const attempt = () => {
			const request = http.get(
				{ host: "localhost", port, path: "/" },
				(res) => {
					res.resume();
					resolve(true);
				},
			);

			request.on("error", () => {
				if (Date.now() > deadline) return resolve(false);
				setTimeout(attempt, 300);
			});
		};

		attempt();
	});
}

function ensureClientDeps() {
	if (fs.existsSync(path.join(CLIENT, "node_modules"))) return;

	console.log("  Installing frontend dependencies (first run only)...\n");
	// A single command string rather than an args array, so passing through a
	// shell (required for npm's Windows shim) needs no escaping.
	const result = spawnSync("npm install", {
		cwd: CLIENT,
		stdio: "inherit",
		shell: true,
	});

	if (result.status !== 0) {
		console.error("\nFrontend dependency install failed.");
		process.exit(1);
	}
}

function checkEnv() {
	if (fs.existsSync(path.join(ROOT, ".env"))) return;

	console.error("No .env file found.");
	console.error("Create one with:  cp .env.example .env");
	console.error("then set GEMINI_API_KEY inside it.\n");
	process.exit(1);
}

async function main() {
	console.log("\nStarting QuizBuild...\n");

	checkEnv();
	ensureClientDeps();

	const apiPort = await findFreePort(Number(process.env.PORT) || 3000, "API");
	const webPort = await findFreePort(5173, "Frontend");

	const api = spawn(process.execPath, [NODEMON, "--quiet", "src/index.js"], {
		cwd: ROOT,
		stdio: "inherit",
		env: { ...process.env, PORT: String(apiPort) },
	});

	// --logLevel warn silences Vite's own startup banner so it cannot compete
	// with the single URL printed below. API_PORT is read by vite.config.js so
	// the dev proxy follows the API wherever it landed.
	const web = spawn(
		process.execPath,
		[VITE, "--port", String(webPort), "--strictPort", "--logLevel", "warn"],
		{
			cwd: CLIENT,
			stdio: "inherit",
			env: { ...process.env, API_PORT: String(apiPort) },
		},
	);

	const children = [api, web];
	let shuttingDown = false;

	function shutdown(code = 0) {
		if (shuttingDown) return;
		shuttingDown = true;

		for (const child of children) {
			if (!child.killed) child.kill();
		}

		process.exit(code);
	}

	for (const child of children) {
		child.on("exit", (code) => {
			if (!shuttingDown) shutdown(code ?? 0);
		});
	}

	process.on("SIGINT", () => shutdown(0));
	process.on("SIGTERM", () => shutdown(0));

	const ready = await waitForServer(webPort);
	if (!ready) {
		console.error("\nThe frontend did not start. See the output above.");
		return shutdown(1);
	}

	// nodemon keeps running after the app crashes, so a live nodemon is not
	// proof of a live API. Check the port itself before claiming it works.
	const apiReady = await waitForServer(apiPort, 8000);

	console.log(`
  ────────────────────────────────────────────
    QuizBuild is running

    Open:  http://localhost:${webPort}
${
	apiReady
		? ""
		: `
    WARNING: the API on port ${apiPort} is not
    responding — see the errors above.
`
}
    Ctrl+C to stop
  ────────────────────────────────────────────
`);
}

main().catch((err) => {
	console.error(err.message);
	process.exit(1);
});
