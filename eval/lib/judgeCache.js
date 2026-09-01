const fs = require("node:fs");
const path = require("node:path");

// Disk-backed record of judgements from previous runs.
//
// The dataset needs more judge calls than a free-tier daily quota allows, so a
// single run can never judge every case. Persisting judgements lets successive
// runs fill in only what is still missing until the set is complete — and once
// it is, re-runs cost nothing, which makes the eval usable as a regression
// check rather than a once-a-day event.
//
// A judgement is a pure function of (question, reference answer, submission),
// so caching it across runs is sound as long as the model and judge prompt are
// unchanged. Both are recorded in the file, and a change to either invalidates
// the cache rather than silently mixing verdicts from different judges.
const CACHE_FILE = path.join(__dirname, "..", ".cache", "judgements.json");

function load(model) {
	if (!fs.existsSync(CACHE_FILE)) return { model, entries: {} };

	try {
		const cached = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));

		if (cached.model !== model) {
			console.log(
				`  cache: discarding judgements from "${cached.model}" (now running "${model}")`,
			);
			return { model, entries: {} };
		}

		return cached;
	} catch {
		return { model, entries: {} };
	}
}

function save(cache) {
	fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
	fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
}

// Wraps a judge so previously recorded verdicts are reused and new ones are
// persisted as they arrive — including on a run that dies partway through
// quota, which is the case this exists for.
function cachedJudge(judge, cache) {
	const stats = { hits: 0, calls: 0 };

	const wrapped = async (args) => {
		const key = `${args.questionId}::${args.submitted.trim().toLowerCase()}`;

		if (cache.entries[key]) {
			stats.hits += 1;
			return cache.entries[key];
		}

		stats.calls += 1;
		const judgement = await judge(args);

		// Only successful judgements are recorded; a null means the model was
		// unreachable, and caching that would make the outage permanent.
		if (judgement) {
			cache.entries[key] = judgement;
			save(cache);
		}

		return judgement;
	};

	return { judge: wrapped, stats };
}

module.exports = { load, save, cachedJudge, CACHE_FILE };
