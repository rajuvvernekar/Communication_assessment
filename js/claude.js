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
    {
      key: 'callClosing',
      label: 'Call Closing',
      scale: '1/3/5',
      prompt: `Evaluate Call Closing. Only three scores are possible.
Score 5 (Fully Met): Agent did ALL three — (1) confirmed resolution ("I've resolved your issue / Is everything sorted?"), (2) asked "Is there anything else I can help/assist you with?", AND (3) closed warmly with a branded sign-off (e.g., "Thank you for calling, have a great day").
Score 3 (Partially Met): Agent did 1 or 2 of the three closing elements but not all three.
Score 1 (Not Met): Call ended abruptly with no proper closing, no confirmation, and no warm farewell.
Return ONLY a JSON: {"score": <1 or 3 or 5>, "reason": "<one sentence>"}`
    },
  ];

  // ---- Generic spoken module prompts ----
  const SPOKEN_CRITERIA = {
    'pick-speak': [
      {
        key: 'fluency', label: 'Fluency',
        prompt: `Evaluate spoken fluency on a 1-5 scale. COUNT every filler before scoring.

STEP 1 — Count filler words: um, uh, like, you know, basically, actually, right (as filler), so (as filler), okay (as filler), hmm, err, sort of, kind of, I mean.
STEP 2 — Count unnatural pauses: "..." or long mid-sentence breaks or awkward silences.

MANDATORY SCORING RULES (apply in order — first rule that matches wins):
Score 1: 10+ filler words OR constant hesitation throughout.
Score 2: 6–9 filler words OR multiple long pauses OR consistently choppy delivery.
Score 3: 3–5 filler words OR several noticeable pauses. Average delivery.
Score 4: 1–2 filler words ONLY. Delivery is mostly smooth with at most one brief hesitation. Confident tone overall.
Score 5: 0 filler words. Completely smooth, confident, and natural delivery throughout. No dead air. (This score requires near-perfect fluency — do not award for merely "good".)

HARD LIMITS — non-negotiable:
- 2+ fillers → score CANNOT be 5.
- 3+ fillers → score CANNOT be 4 or 5.
- 6+ fillers → score CANNOT be 3, 4 or 5.

Return ONLY JSON: {"score":<1-5>,"reason":"<exact filler count found + pacing observation in one sentence>"}`
      },
      {
        key: 'vocabulary', label: 'Vocabulary & Grammar',
        prompt: `Evaluate vocabulary richness AND grammatical accuracy on a 1-5 scale. LIST errors before scoring.

STEP 1 — List every grammar error found:
- Subject-verb disagreement (e.g. "they was", "he don't")
- Wrong tense (e.g. "I have went", "yesterday I go")
- Missing or wrong article (e.g. "I went to office", "a umbrella")
- Wrong preposition (e.g. "interested on", "depend of")
- Run-on sentence, sentence fragment, or incomplete thought
- Any other grammatical mistake

STEP 2 — Assess vocabulary:
- Are words varied and precise, or repetitive and basic?
- Does the speaker use different sentence structures, or the same pattern repeatedly?

MANDATORY SCORING RULES:
Score 1: 7+ grammar errors OR extremely basic vocabulary with almost no variety.
Score 2: 4–6 grammar errors OR poor vocabulary with heavy repetition.
Score 3: 2–3 grammar errors. Some vocabulary repetition or limited sentence variety. Average overall.
Score 4: Exactly 1 grammar error. Good vocabulary. Clear sentence variety. No major weaknesses.
Score 5: 0 grammar errors. Rich, precise vocabulary. Multiple varied sentence structures. Genuinely impressive. (Do NOT give 5 if any grammar error exists.)

HARD LIMITS — non-negotiable:
- 1+ grammar error → score CANNOT be 5.
- 2+ grammar errors → score CANNOT be 4 or 5.
- 4+ grammar errors → score CANNOT be 3, 4 or 5.

Return ONLY JSON: {"score":<1-5>,"reason":"<exact grammar error count + vocabulary/variety observation in one sentence>"}`
      },
      {
        key: 'contentCoverage', label: 'Content Coverage',
        prompt: `Evaluate content coverage and depth on a 1-5 scale. Be STRICT about structure and substance.

MANDATORY SCORING RULES:
Score 5: Clear 3-part structure (opening, developed body, conclusion). At least 3 distinct specific examples or facts directly supporting the topic. No major gaps. Genuinely well-organized. (Very rare — do not award for merely "good coverage".)
Score 4: Clear structure evident. At least 2 distinct specific examples. One minor gap acceptable. Content goes beyond surface level.
Score 3: Main idea present but shallow. Only 1 example or vague generic points. Structure incomplete (missing opening OR conclusion). Average coverage.
Score 2: Very shallow. Barely addresses the topic. No real structure. No examples.
Score 1: Off-topic, incoherent, or essentially no meaningful content.

HARD LIMITS:
- Fewer than 2 specific examples → score CANNOT be 4 or 5.
- No clear structure → score CANNOT be 4 or 5.
- Generic or vague responses without substance → score MUST be 3 or lower.

Return ONLY JSON: {"score":<1-5>,"reason":"<structure quality + example count in one sentence>"}`
      }
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

  // ---- Original (balanced) P&S criteria — used when resetting strict re-scores ----
  // These match the scoring thresholds used before today's strict overhaul.
  const SPOKEN_CRITERIA_BALANCED = {
    'pick-speak': [
      {
        key: 'fluency', label: 'Fluency',
        prompt: `Evaluate spoken fluency on a 1-5 scale.

Count ALL filler words: um, uh, like, you know, basically, actually, right (as filler), so (as filler), okay (as filler), hmm, err.
Count unnatural pauses or dead air (shown as "..." or sudden topic breaks).

Scoring rules:
Score 5: 0–1 filler words. Smooth confident delivery. No dead air.
Score 4: 2 fillers max. Mostly smooth with at most one brief hesitation.
Score 3: 3–5 filler words OR noticeable pauses. Understandable but clearly hesitant.
Score 2: 6–9 filler words OR multiple long pauses OR choppy delivery.
Score 1: 10+ filler words OR constant hesitation OR long dead air.

RULE: 3 or more filler words → score MUST be 3 or lower.
Return ONLY JSON: {"score":<1-5>,"reason":"<one sentence stating filler count and pacing observation>"}`
      },
      {
        key: 'vocabulary', label: 'Vocabulary & Grammar',
        prompt: `Evaluate vocabulary richness AND grammatical accuracy on a 1-5 scale.

Consider:
(a) Grammar errors: subject-verb disagreement, wrong tense, missing articles, incorrect prepositions, run-on sentences.
(b) Sentence variety: varied structures vs. repetitive patterns.
(c) Word choice: varied and appropriate vocabulary vs. simple and repetitive.

Scoring rules:
Score 5: 0–1 grammar errors. Rich varied vocabulary. Good sentence variety.
Score 4: 2 grammar errors max. Decent vocabulary with minor repetition.
Score 3: 3 grammar errors. Score MUST be 3 or lower if 3 errors found. Some repetition.
Score 2: 4–5 grammar errors. Poor vocabulary, repetitive language.
Score 1: 6+ grammar errors. Very limited vocabulary, monotone sentences.

RULE: 3+ errors → score MUST be 3 or lower. 5+ errors → score MUST be 2 or lower.
Return ONLY JSON: {"score":<1-5>,"reason":"<one sentence on grammar and vocabulary>"}`
      },
      {
        key: 'contentCoverage', label: 'Content Coverage',
        prompt: `Evaluate content coverage and depth on a 1-5 scale.

Score 5: Covers topic thoroughly with a clear opening, at least 2 specific examples or supporting points, and a conclusive close. Well-structured.
Score 4: Good coverage with a minor gap. At least 1 clear example. Some structure evident.
Score 3: Partial coverage only. Vague or generic points. Lacks examples or conclusion.
Score 2: Very shallow. Barely addresses the topic. No structure or examples.
Score 1: Off-topic or essentially no meaningful content delivered.

Return ONLY JSON: {"score":<1-5>,"reason":"<one sentence on topic coverage and structure>"}`
      }
    ]
  };

  // ---- Time Management — pure calculation, no LLM ----
  // Scoring based on actual recording duration:
  //   < 2:00 → 1  |  2:00–2:59 → 2  |  3:00–3:59 → 3  |  4:00–4:39 → 4  |  ≥ 4:40 → 5
  function _fmtDur(secs) {
    const m = Math.floor(secs / 60), s = secs % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }
  function scoreTimeManagement(durationSeconds) {
    const s = Math.round(durationSeconds || 0);
    if (s >= 280) return { score: 5, reason: `Spoke for ${_fmtDur(s)} — excellent time usage (target ≥ 4:40).` };
    if (s >= 240) return { score: 4, reason: `Spoke for ${_fmtDur(s)} — good time usage (4:00–4:39).` };
    if (s >= 180) return { score: 3, reason: `Spoke for ${_fmtDur(s)} — acceptable but under 4 minutes.` };
    if (s >= 120) return { score: 2, reason: `Spoke for ${_fmtDur(s)} — too brief, under 3 minutes.` };
    return         { score: 1, reason: `Spoke for only ${_fmtDur(s)} — far too short.` };
  }

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
    const system = `You are a STRICT communication trainer evaluating a trainee's spoken response. Topic: "${topicTitle}". ${topicScenario ? `Scenario: ${topicScenario}` : ''}

CRITICAL EVALUATION RULES — FOLLOW EXACTLY:
- Score 3 is AVERAGE performance. Do NOT treat 3 as bad or give 4 to avoid seeming harsh.
- Score 4 requires genuinely above-average delivery — not just "decent". Earn it.
- Score 5 is exceptional and should be rare. Do NOT give 5 for a good-but-not-outstanding response.
- When in doubt between two scores, ALWAYS choose the LOWER one.
- Never inflate scores to encourage trainees. Accurate assessment helps them improve.`;
    const user = `Trainee's response transcript:\n"""\n${transcript || '(no transcript available)'}\n"""\n\n${criterion.prompt}`;

    const raw = await callClaude(system, user);
    return parseScore(raw);
  }

  // ---- Main evaluate function ----
  // durationSeconds (optional): actual recording length in seconds — used to
  // compute the Time Management score for pick-speak without an LLM call.
  async function evaluate(module, transcript, topicTitle, topicScenario, durationSeconds) {
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
            results.scores[criterion.key] = result.score;
            results.reasons[criterion.key] = result.reason || '';
          }
        } catch (e) {
          console.warn(`Claude scoring failed for ${criterion.key}:`, e.message);
        }
      }

      // Time Management — injected for pick-speak when duration is available
      if (module === 'pick-speak' && durationSeconds != null) {
        const tm = scoreTimeManagement(durationSeconds);
        results.scores['timeManagement']  = tm.score;
        results.reasons['timeManagement'] = tm.reason;
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

  // ---- Balanced evaluate — uses original pre-strict criteria ----
  // Used by the reset flow when no _prev backup exists.
  async function evaluateBalanced(module, transcript, topicTitle, topicScenario, durationSeconds) {
    if (!isAvailable()) return null;

    const criteria = SPOKEN_CRITERIA_BALANCED[module];
    if (!criteria) return evaluate(module, transcript, topicTitle, topicScenario, durationSeconds);

    const results = { scores: {}, reasons: {}, overall: null };
    try {
      for (const criterion of criteria) {
        try {
          const system = `You are a communication trainer evaluating a trainee's spoken response. Topic: "${topicTitle}". ${topicScenario ? `Scenario: ${topicScenario}` : ''}

Evaluate fairly and objectively. Give credit where it is due. Apply the scoring rules as written — not more strictly, not more leniently.`;
          const user = `Trainee's response transcript:\n"""\n${transcript || '(no transcript available)'}\n"""\n\n${criterion.prompt}`;
          const raw  = await callClaude(system, user);
          const res  = parseScore(raw);
          if (res && typeof res.score === 'number') {
            results.scores[criterion.key]  = res.score;
            results.reasons[criterion.key] = res.reason || '';
          }
        } catch (e) {
          console.warn(`Balanced scoring failed for ${criterion.key}:`, e.message);
        }
      }

      if (module === 'pick-speak' && durationSeconds != null) {
        const tm = scoreTimeManagement(durationSeconds);
        results.scores['timeManagement']  = tm.score;
        results.reasons['timeManagement'] = tm.reason;
      }

      const vals = Object.values(results.scores).filter(v => typeof v === 'number');
      if (vals.length > 0) {
        const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
        results.overall = parseFloat(((avg / 5) * 100).toFixed(1));
      }
      return results;
    } catch (e) {
      console.error('Balanced evaluation failed:', e.message);
      return null;
    }
  }

  // ---- Evaluate a rewrite-the-sentence answer ----
  // Returns true if the student's answer correctly fixes the grammatical error,
  // regardless of minor punctuation differences (full stops, commas, etc.).
  async function evaluateRewrite(originalSentence, studentAnswer, modelAnswers) {
    if (!isAvailable()) return false;
    if (!studentAnswer || !studentAnswer.trim()) return false;

    const modelStr = modelAnswers.join(' OR ');
    const system   = `You are a helpful grammar examiner for an English proficiency test. Your job is to check if a student correctly fixed a grammatical error. Respond ONLY with valid JSON.`;
    const user     = `Original (incorrect) sentence: "${originalSentence}"
Model answer(s): "${modelStr}"
Student's answer: "${studentAnswer}"

Evaluate whether the student's answer is acceptable:
1. Did the student correctly fix the grammatical error present in the original sentence?
2. Does their rewritten sentence convey the same meaning as the model answer?

IMPORTANT RULES:
- Ignore ALL punctuation differences (missing or extra full stops, commas, apostrophes, etc.). Do NOT penalise for punctuation.
- Both "He doesn't" and "He does not" are equivalent — accept both forms.
- Accept any grammatically correct phrasing that fixes the same error, even if worded slightly differently from the model answer, as long as the meaning is preserved.
- If the student fixed the error correctly and the sentence is grammatically sound, return {"pass": true}.

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

  // ---- Live AI customer for the Takeover topic mock call ----
  // `messages` is the full alternating user/assistant history built by _buildAiMessages() in app.js.
  // Returns a string — the customer's next dialogue line (2-3 sentences max).
  async function callAiCustomer(scenario, description, messages, turnNumber, maxTurns) {
    if (!isAvailable()) throw new Error('Claude proxy not configured');

    const isLast = turnNumber >= maxTurns;
    const system = `You are roleplaying as a frustrated but articulate customer calling Zerodha's customer support line.

SCENARIO: ${scenario || description || 'A client has an issue with their trading account.'}

YOUR PERSONA:
- Long-term Zerodha investor who is knowledgeable about trading
- Genuinely frustrated that you cannot apply for a takeover offer directly because the market price is higher than the takeover price
- Logical and sharp — you ask pointed follow-up questions based on exactly what the agent tells you
- You push back firmly but do not use abusive language
- If the agent explains clearly and empathetically, soften slightly — but still probe further
- If the agent is vague or evasive, escalate your frustration

STRICT RULES:
- You are the CUSTOMER — stay in character at all times, never break the fourth wall
- Reply in 2–3 sentences ONLY — short, sharp, conversational
- Ask ONE specific question or make ONE clear statement per turn
- Reference what the agent actually said to make the conversation feel natural and live
- Do NOT repeat what the agent said verbatim; react to it${isLast ? '\n- This is your FINAL turn (turn ' + turnNumber + ' of ' + maxTurns + '). Either express whether you are satisfied with how the agent handled this, or state you are ending the call.' : ''}

Return ONLY the customer\'s spoken dialogue. No stage directions, no narration, no quotes.`;

    const resp = await fetch(getProxyUrl(), {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        model:      MODEL,
        max_tokens: 120,
        system,
        messages
      })
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error?.message || `API error ${resp.status}`);
    }
    const data = await resp.json();
    return data.content[0].text.trim();
  }

  // ---- Get criteria for a module (for display purposes) ----
  function getCriteria(module) {
    if (module === 'mock-call') return MOCK_CALL_CRITERIA;
    return SPOKEN_CRITERIA[module] || [];
  }

  return { isAvailable, evaluate, evaluateBalanced, evaluateRewrite, callAiCustomer, getCriteria, scoreTimeManagement, MOCK_CALL_CRITERIA };
})();
