const { randomUUID } = require("node:crypto");

// One JSON object per line, which is what log aggregators expect and what
// makes a request traceable by id. Kept dependency-free deliberately.
const SILENT = process.env.LOG_LEVEL === "silent";

function log(level, message, fields = {}) {
	if (SILENT) return;

	const line = JSON.stringify({
		ts: new Date().toISOString(),
		level,
		message,
		...fields,
	});

	if (level === "error") console.error(line);
	else if (level === "warn") console.warn(line);
	else console.log(line);
}

const logger = {
	info: (message, fields) => log("info", message, fields),
	warn: (message, fields) => log("warn", message, fields),
	error: (message, fields) => log("error", message, fields),
};

// Tags every request with an id, echoes it back on the response, and logs the
// outcome once the response is finished so duration is real.
function requestLogger(req, res, next) {
	req.id = req.get("x-request-id") || randomUUID();
	res.set("x-request-id", req.id);

	const startedAt = process.hrtime.bigint();

	res.on("finish", () => {
		const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;

		logger.info("request", {
			requestId: req.id,
			method: req.method,
			path: req.originalUrl,
			status: res.statusCode,
			durationMs: Math.round(durationMs),
		});
	});

	next();
}

module.exports = { logger, requestLogger };
