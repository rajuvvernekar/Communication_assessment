'use strict';

const ClaudeEvaluator = (() => {
  // ---- Config ----
  const MODEL = 'claude-haiku-4-5-20251001';

  // API calls go through the Cloudflare Worker proxy (key stored server-side)
  function getProxyUrl() {
    return (typeof CONFIG !== 'undefined' && CONFIG.CLAUDE_PROXY_URL) || '';
  }

  function isAvailable() {
    const url = getProxyUrl();
    return !!url && !url.includes('YOUR_WORKER');
  }

  // ---- Mock Call Scoring Prompts (from Excel rubric) ----
  const MOCK_CALL_CRITERIA = [
    {
      key: 'callOpening',
      label: 'Call Opening',
      scale: '1-5',
      prompt: `Evaluate the Call Opening on a scale of 1 to 5.
Score 5: Agent greeted with "Good Morning/Good Afternoon/Good Evening, Thank you for calling Zerodha, my name is [Name], how may I assist you today?" — all four elements present.
Score 4: Three elements present.
Score 3: Two elements present.
Score 2: One element present.
Score 1: No structured greeting at all.
Return ONLY a JSON: {"score": <1-5>, "reason": "<one sentence>"}`
    },
    {
      key: 'acknowledgment',
      label: 'Acknowledgment',
      scale: '1-5',
      prompt: `Evaluate Acknowledgment on a scale of 1 to 5.
Score 5: Agent acknowledged the issue promptly with empathy — e.g., "I understand how frustrating this must be for you, let me check that for you" — showing empathy + willingness to help.
Score 4: Acknowledged but empathy slightly generic.
Score 3: Acknowledged but no real empathy.
Score 2: Minimal acknowledgment.
Score 1: No acknowledgment at all.
Return ONLY a JSON: {"score": <1-5>, "reason": "<one sentence>"}`
    },
    {
      key: 'communicationClarity',
      label: 'Communication Clarity',
      scale: '1-5',
      prompt: `Evaluate Communication Clarity on a scale of 1 to 5.
Score 5: Appropriate speech rate, grammatically correct, professional tone, no filler words (um/uh/like), no dead air/unnecessary pauses.
Score 4: Mostly clear with one minor issue.
Score 3: Noticeable filler words or some dead air, but still understandable.
Score 2: Frequent filler words, poor grammar, or long dead air.
Score 1: Very unclear speech, heavy filler usage, hard to follow.
Return ONLY a JSON: {"score": <1-5>, "reason": "<one sentence>"}`
    },
    {
      key: 'callEssence',
      label: 'Call Essence',
      scale: '1-5',
      prompt: `Evaluate Call Essence (Politeness, Empathy, Rapport) on a scale of 1 to 5.
Score 5: Maintained politeness throughout, demonstrated genuine empathy, built rapport naturally without being scripted.
Score 4: Mostly empathetic with minor lapses.
Score 3: Polite but transactional, little genuine rapport.
Score 2: Somewhat cold or robotic.
Score 1: Rude, dismissive, or completely tone-deaf.
Return ONLY a JSON: {"score": <1-5>, "reason": "<one sentence>"}`
    },
    {
      key: 'holdProcedure',
      label: 'Hold Procedure',
      scale: '1/3/5',
      prompt: `Evaluate Hold Procedure. Only three scores are possible.
Score 5 (Fully Met): Agent asked for permission to put on hold, gave a reason, AND stated a time expectation (e.g., "May I place you on hold for 2 minutes while I check?").
Score 3 (Partially Met): Asked permission but did not give reason or time expectation (or vice versa).
Score 1 (Not Met): Put customer on hold without asking or without any explanation.
If no hold was used in the call, score 5.
Return ONLY a JSON: {"score": <1 or 3 or 5>, "reason": "<one sentence>"}`
    },
    {
      key: 'extraMile',
      label: 'Extra Mile',
      scale: '1/3/5',
      prompt: `Evaluate Extra Mile (going beyond the standard process). Only three scores are possible.
Score 5 (Fully Met): Agent proactively offered additional help, tips, or information beyond what was asked — e.g., mentioning related features, preventing a future issue.
Score 3 (Partially Met): Hinted at extra help but did not follow through clearly.
Score 1 (Not Met): Only handled the exact query, no effort to add value.
Return ONLY a JSON: {"score": <1 or 3 or 5>, "reason": "<one sentence>"}`
    },
  ];

  // ---- Generic spoken module prompts ----
  const SPOKEN_CRITERIA = {
    'pick-speak': [
      { key: 'fluency', label: 'Fluency', prompt: 'Evaluate spoken fluency on a 1-5 scale. Consider: smooth delivery, minimal hesitations, good pacing. Return ONLY JSON: {"score":<1-5>,"reason":"<one sentence>"}' },
      { key: 'vocabulary', label: 'Vocabulary', prompt: 'Evaluate vocabulary richness on a 1-5 scale. Consider: word variety, appropriate word choice, avoiding repetition. Return ONLY JSON: {"score":<1-5>,"reason":"<one sentence>"}' },
      { key: 'contentCoverage', label: 'Content Coverage', prompt: 'Evaluate content coverage and depth on a 1-5 scale. Consider: topic relevance, examples given, completeness of ideas. Return ONLY JSON: {"score":<1-5>,"reason":"<one sentence>"}' }
    ],
    'role-play': [
      { key: 'empathy', label: 'Empathy', prompt: 'Evaluate empathy shown in a role play on a 1-5 scale. Consider: acknowledgment of feelings, supportive language. Return ONLY JSON: {"score":<1-5>,"reason":"<one sentence>"}' },
      { key: 'assertiveness', label: 'Assertiveness', prompt: 'Evaluate assertiveness on a 1-5 scale. Consider: clear position, confident delivery, not passive. Return ONLY JSON: {"score":<1-5>,"reason":"<one sentence>"}' },
      { key: 'resolution', label: 'Resolution Approach', prompt: 'Evaluate the resolution approach on a 1-5 scale. Consider: practical solution offered, follow-through. Return ONLY JSON: {"score":<1-5>,"reason":"<one sentence>"}' },
      { key: 'professionalism', label: 'Professionalism', prompt: 'Evaluate professionalism on a 1-5 scale. Consider: tone, language, composure. Return ONLY JSON: {"score":<1-5>,"reason":"<one sentence>"}' }
    ],
    'group-discussion': [
      { key: 'participation', label: 'Participation Quality', prompt: 'Evaluate the quality of participation in a group discussion on a 1-5 scale. Consider: relevance, depth of contribution, engagement. Return ONLY JSON: {"score":<1-5>,"reason":"<one sentence>"}' },
      { key: 'argumentation', label: 'Argumentation', prompt: 'Evaluate argumentation on a 1-5 scale. Consider: logical reasoning, use of facts/examples, structured thinking. Return ONLY JSON: {"score":<1-5>,"reason":"<one sentence>"}' },
      { key: 'responsiveness', label: 'Responsiveness', prompt: 'Evaluate responsiveness/adaptability on a 1-5 scale. Consider: whether points address the topic and build on prior points. Return ONLY JSON: {"score":<1-5>,"reason":"<one sentence>"}' },
      { key: 'clarity', label: 'Communication Clarity', prompt: 'Evaluate clarity of communication on a 1-5 scale. Consider: clear speech, organized thoughts, appropriate language. Return ONLY JSON: {"score":<1-5>,"reason":"<one sentence>"}' }
    ]
  };

  // ---- API call (via Cloudflare Worker proxy — no API key in browser) ----
  async function callClaude(systemPrompt, userContent) {
    const proxyUrl = getProxyUrl();
    if (!proxyUrl) throw new Error('Claude proxy URL not configured in config.js');

    const resp = await fetch(proxyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 200,
        system: systemPrompt,
        messages: [{ role: 'user', content: userContent }]
      })
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error?.message || `API error ${resp.status}`);
    }

    const data = await resp.json();
    return data.content[0].text.trim();
  }

  // ---- Parse JSON from Claude response ----
  function parseScore(text) {
    try {
      const match = text.match(/\{[^}]+\}/);
      if (match) return JSON.parse(match[0]);
    } catch (_) {}
    return null;
  }

  // ---- Evaluate a single criterion ----
  async function scoreCriterion(criterion, transcript, topicTitle, topicScenario) {
    const system = `You are an expert communication trainer evaluating a trainee's spoken response. Topic: "${topicTitle}". ${topicScenario ? `Scenario: ${topicScenario}` : ''}`;
    const user = `Trainee's response transcript:\n"""\n${transcript || '(no transcript available)'}\n"""\n\n${criterion.prompt}`;

    const raw = await callClaude(system, user);
    return parseScore(raw);
  }

  // ---- Main evaluate function ----
  async function evaluate(module, transcript, topicTitle, topicScenario) {
    if (!isAvailable()) return null;

    const results = { scores: {}, reasons: {}, overall: null };

    try {
      let criteria;
      if (module === 'mock-call') {
        criteria = MOCK_CALL_CRITERIA;
      } else {
        criteria = SPOKEN_CRITERIA[module];
      }

      if (!criteria) return null;

      // Score each criterion sequentially to avoid rate limiting
      for (const criterion of criteria) {
        try {
          const result = await scoreCriterion(criterion, transcript, topicTitle, topicScenario);
          if (result && typeof result.score === 'number') {
            // Normalize 1/3/5 scale to 1-5 for display consistency
            results.scores[criterion.key] = result.score;
            results.reasons[criterion.key] = result.reason || '';
          }
        } catch (e) {
          console.warn(`Claude scoring failed for ${criterion.key}:`, e.message);
        }
      }

      // Calculate overall: average out of 5, converted to percentage out of 100
      const vals = Object.values(results.scores).filter(v => typeof v === 'number');
      if (vals.length > 0) {
        const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
        results.overall = parseFloat(((avg / 5) * 100).toFixed(1));
      }

      return results;
    } catch (e) {
      console.error('Claude evaluation failed:', e.message);
      return null;
    }
  }

  // ---- Evaluate a rewrite-the-sentence answer ----
  // Returns true if the student's answer is grammatically correct AND
  // fixes the same error as the model answer (same meaning preserved).
  async function evaluateRewrite(originalSentence, studentAnswer, modelAnswers) {
    if (!isAvailable()) return false;
    if (!studentAnswer || !studentAnswer.trim()) return false;

    const modelStr = modelAnswers.join(' OR ');
    const system   = `You are a strict grammar examiner for an English proficiency test. Your ONLY job is to decide if a student's rewritten sentence is acceptable. Respond ONLY with valid JSON.`;
    const user     = `Original (incorrect) sentence: "${originalSentence}"
Model answer(s): "${modelStr}"
Student's answer: "${studentAnswer}"

Evaluate the student's answer:
1. Is the student's answer grammatically correct?
2. Does it fix the same grammatical error as the model answer?
3. Does it preserve the original meaning?

If ALL three conditions are true, award full marks. If any condition fails, award zero.
Return ONLY this JSON: {"pass": true} or {"pass": false}`;

    try {
      const raw  = await callClaude(system, user);
      const match = raw.match(/\{[^}]+\}/);
      if (match) {
        const obj = JSON.parse(match[0]);
        return obj.pass === true;
      }
    } catch (e) {
      console.warn('evaluateRewrite Claude error:', e.message);
    }
    return false;
  }

  // ---- Get criteria for a module (for display purposes) ----
  function getCriteria(module) {
    if (module === 'mock-call') return MOCK_CALL_CRITERIA;
    return SPOKEN_CRITERIA[module] || [];
  }

  return { isAvailable, evaluate, evaluateRewrite, getCriteria, MOCK_CALL_CRITERIA };
})();
