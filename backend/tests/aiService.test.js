const test = require("node:test");
const assert = require("node:assert/strict");
const axios = require("axios");
const aiService = require("../services/aiService");
const { checkAiService } = aiService;

const originalGet = axios.get;
const originalPost = axios.post;
const previousAiEnabled = process.env.AI_ENABLED;
const previousAiToken = process.env.AI_SERVICE_TOKEN;
test.after(() => {
    axios.get = originalGet;
    axios.post = originalPost;
    if (previousAiEnabled === undefined) delete process.env.AI_ENABLED;
    else process.env.AI_ENABLED = previousAiEnabled;
    if (previousAiToken === undefined) delete process.env.AI_SERVICE_TOKEN;
    else process.env.AI_SERVICE_TOKEN = previousAiToken;
});

const enableAiForTest = () => {
    process.env.AI_ENABLED = "true";
    process.env.AI_SERVICE_TOKEN = "test-only-token-with-at-least-thirty-two-characters";
};

test("AI health check reports loaded scoring readiness without returning its URL", async () => {
    enableAiForTest();
    axios.get = async () => ({ status: 200, data: { status: "ok", scan_scoring_model_loaded: true } });
    assert.deepEqual(await checkAiService(), { available: true, scanScoringModelLoaded: true });
});

test("AI health check treats unavailable service as not ready", async () => {
    enableAiForTest();
    axios.get = async () => { throw Object.assign(new Error("offline"), { code: "ECONNREFUSED" }); };
    assert.deepEqual(await checkAiService(), { available: false, scanScoringModelLoaded: false });
});

test("AI requests remain disabled without explicit enablement and a strong service token", async () => {
    delete process.env.AI_ENABLED;
    delete process.env.AI_SERVICE_TOKEN;
    let requests = 0;
    axios.get = async () => { requests += 1; };
    axios.post = async () => { requests += 1; };
    assert.deepEqual(await checkAiService(), { available: false, scanScoringModelLoaded: false });
    await assert.rejects(aiService.scoreScanBehavior({
        scan_count: 2,
        distinct_locations: 1,
        avg_time_between_scans_hr: 1
    }), (error) => error.code === "AI_DISABLED");
    assert.equal(requests, 0);
});
