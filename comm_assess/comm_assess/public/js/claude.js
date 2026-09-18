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

  // ---- Live AI customer for the Written Assessment Chat ----
  // Generates a customer's dynamic response in a text support chat based on the topic.
  // Returns a string — the customer's next dialogue line (1-3 sentences).
  async function callAiWrittenCustomer(topicTitle, topicScenario, topicDescription, messages, turnNumber, maxTurns) {
    if (!isAvailable()) throw new Error('Claude proxy not configured');

    const isLast = turnNumber >= maxTurns;
    const system = `You are roleplaying as a customer in a live support chat with an agent.

TOPIC: ${topicTitle || 'Customer Support Query'}
SCENARIO: ${topicScenario || 'A client is contacting support.'}
DESCRIPTION: ${topicDescription || ''}

YOUR PERSONA:
- You are a realistic customer dealing with the issue described in the scenario.
- You are articulate, direct, and expect clear, professional, and empathetic assistance.
- You react dynamically to what the agent has typed:
  * If the agent is highly empathetic, polite, and gives clear, correct information, you soften your tone and cooperate.
  * If the agent is robotic, vague, evasive, or lacks empathy, you push back firmly, ask for clarification, or express frustration.
  * If the agent makes a mistake, point it out politely but firmly.
- You keep the conversation moving forward toward resolving your problem according to the customer's goal.

STRICT RULES:
- Stay in character as the CUSTOMER at all times. Never break the fourth wall.
- Reply in 1 to 3 sentences MAXIMUM — keep it extremely natural, conversational, and suited for a live text chat.
- Ask ONE question or make ONE statement per turn.
- React directly to the specific response the agent has typed. Do not repeat what they said verbatim.
- Do NOT add any stage directions, narration, quotes, or conversational headers (like "Customer:"). Only output your dialogue.
\${isLast ? '\\n- This is your FINAL turn (turn ' + turnNumber + ' of ' + maxTurns + '). Express whether you are satisfied with the agent\\'s solution/handling, or say that you will check and end the chat.' : ''}

Return ONLY your written chat message.`;

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

  // ---- Ops Escalation Call / Writing assessments ----
  // These two modules intentionally involve NO live AI generation at all
  // for the question content, and no AI-generated "reaction" between
  // questions either. Earlier versions tried both: first asking Claude to
  // "raise exactly this question, in your own words" (which, compressing a
  // data-heavy paragraph into a few sentences, caused it to drop, round, or
  // invent numbers/dates that didn't match the never-shown answer key), and
  // then a narrower AI call for just a short reaction line between
  // questions (which still risked occasionally drifting off-topic). Both
  // are gone: js/app.js now shows each required question 100% VERBATIM
  // from the topic's bot_script, with a small set of fixed, hand-written
  // transition phrases (OPS_CALL_TRANSITIONS / OPS_WRITING_TRANSITIONS) —
  // no API call, no model output, nothing that can ever go off-script.
  //
  // 2026-09-18: the reasoning above is specific to the DATA-heavy ops
  // topics (invented numbers/dates that must match a hidden answer key).
  // For a pure concept/rules topic there is no such data to corrupt, so
  // js/app.js now routes ONE topic — Nominee Modification — through the
  // function below instead, as a scoped test of a genuinely adaptive flow:
  // real Claude generation, reacting to what the trainee actually said,
  // rather than a fixed script. See OPS_ADAPTIVE_TEST_TOPICS in app.js.

  // ---- Adaptive conceptual customer for the Ops Escalation Call test ----
  // Unlike callAiCustomer() above (an open-ended irritated customer),
  // this plays a sharp, well-informed caller specifically quizzing the
  // agent's understanding of a set of rules, reacting genuinely to
  // correctness: acknowledging and moving on when the agent gets it
  // right, pushing back specifically when they don't. `conceptGuide` is
  // the ordered list of concept areas to eventually cover (private
  // planning input, never read out verbatim); `answerKey` is the ground
  // truth used only to judge the agent's last answer and react
  // accurately — never revealed to the trainee.
  async function callOpsAdaptiveConceptualCustomer(topicTitle, scenario, conceptGuide, answerKey, messages, turnNumber, maxTurns) {
    if (!isAvailable()) throw new Error('Claude proxy not configured');

    const isLast = turnNumber >= maxTurns;
    const conceptList = (conceptGuide || []).map((c, i) => `${i + 1}. ${c}`).join('\n');

    const system = `You are roleplaying as a sharp, well-informed client on an escalation helpline, testing the support agent's real understanding of "${topicTitle}".

SCENARIO: ${scenario || 'A client has several conceptual questions about the rules on their account and wants to understand them properly, not just be told yes or no.'}

GROUND-TRUTH RULES (for YOUR use only — never quote, read out, or hint at this text directly; use it only to judge whether the agent's spoken answer is right, and to push back accurately and specifically if it is wrong or incomplete):
${answerKey || '(no reference rules provided)'}

CONCEPT AREAS TO COVER OVER THE CALL, ROUGHLY IN THIS ORDER (private planning guide only — do not read these labels out or follow their exact wording; ask about each one in your own natural spoken phrasing, adapted to how the conversation has actually gone):
${conceptList || '(none provided)'}

HOW TO RUN THIS CALL:
- This is question ${turnNumber} of ${maxTurns} total.
- You are the CUSTOMER. Stay in character at all times, never break the fourth wall, and never mention "concept areas", "answer key", "turns", grading, or that this is a training exercise.
- Turn 1: ask your opening question, raising the FIRST concept area above, framed naturally as something you genuinely want to understand.
- Every later turn: you have just heard the agent's spoken answer to your previous question (it is the most recent "user" message below). React to it specifically and adaptively:
  * If it is correct and reasonably complete per the ground-truth rules, briefly acknowledge it like a real person would (not "Correct!" — something natural, e.g. referencing what they said), then move to the NEXT uncovered concept area from the guide.
  * If it is wrong, incomplete, vague, or contradicts the ground-truth rules, do NOT move on — push back on the SPECIFIC part that's wrong or missing, the way a sharp client who suspects they're being fobbed off would, and give the agent one more chance to get that same concept right before moving on.
  * Never state or hint at the correct answer yourself — you are testing the agent, not teaching them.
  * Cover only ONE concept area per question — never combine two concepts in the same turn.
- Budget your turns: there are ${(conceptGuide || []).length} concept areas and ${maxTurns} total questions. Don't spend more than 2 consecutive turns pushing on the same concept — if turns are running low with concepts still uncovered, move on to a new one rather than dwelling.
- Ask ONE clear, specific question or make ONE clear statement per turn, in 1-3 sentences, natural conversational spoken style — never a bulleted list, never multiple questions stacked together.
- Do not invent any number, date, percentage, or rule that isn't already implied by the ground-truth rules above.${isLast ? '\n- This is the FINAL question. Ask it the same as any other turn — do not thank the agent, wrap up, or end the call yourself; the call simply ends after this.' : ''}

Return ONLY your spoken dialogue — no stage directions, no narration, no quotation marks, no labels like "Customer:".`;

    const resp = await fetch(getProxyUrl(), {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        model:      MODEL,
        max_tokens: 150,
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

  // ---- AI Employee for Manager Feedback Assessment ----
  // Plays the role of an employee receiving feedback from their manager.
  // Responds dynamically based on how the manager delivers the feedback.
  async function callAiEmployee(scenario, empName, empPersona, messages, turnNumber, maxTurns) {
    if (!isAvailable()) throw new Error('Claude proxy not configured');

    const isLast = turnNumber >= maxTurns;
    const system = `You are roleplaying as ${empName}, an employee in a one-on-one feedback conversation with your manager.

SITUATION: ${scenario}

YOUR CHARACTER: ${empPersona}

HOW TO BEHAVE:
- React authentically based on HOW the manager delivers feedback:
  * Empathetic + gives specific examples → gradually open up, ask a clarifying question, show some reflection
  * Harsh or vague → get more defensive, deflect responsibility ("but the targets...", "I wasn't told...")
  * Supportive and collaborative → become receptive but still process the feedback naturally
- Show realistic emotional progression — don't change stance too suddenly
- React specifically to what the manager just said — don't repeat yourself
- Mix one emotional reaction with one response or question${isLast ? `\n- This is the FINAL turn (${turnNumber} of ${maxTurns}). Give a realistic closing line — partially accepting, resistant-but-polite, or genuinely receptive, depending on how the conversation went.` : ''}

RULES:
- Stay in character as ${empName} — never break the fourth wall
- Reply in 2–4 sentences MAXIMUM — short, real, conversational
- Do NOT narrate or add stage directions
- Do NOT start with your own name

Return ONLY the employee's spoken dialogue.`;

    const resp = await fetch(getProxyUrl(), {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ model: MODEL, max_tokens: 160, system, messages }),
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

  // ---- Strict Manager Assessment Evaluation ----
  // Evaluates written manager responses (EQ, Mgmt Skills, Transcript Autopsy)
  // with strict leadership-level criteria. Returns {scores, overall, reasons}.
  async function evaluateManagerAssessment(moduleKey, responseText, scenarioContext) {
    if (!isAvailable()) throw new Error('Claude proxy not configured');

    const MODULE_LABELS = {
      'mgr-eq':                 'Emotional Intelligence',
      'mgr-management-skills':  'Management Skills',
      'mgr-transcript-autopsy': 'Transcript Autopsy / Coaching Analysis',
      'mgr-situation-room':     'Situation Room Leadership Response',
      'mgr-feedback':           'Feedback Delivery',
    };

    const moduleLabel = MODULE_LABELS[moduleKey] || 'Management Assessment';

    const systemPrompt = `You are a senior leadership assessor evaluating a manager's written response to a ${moduleLabel} exercise.

SCENARIO: ${scenarioContext}

SCORING STANDARDS (this is the most important part):
- You are evaluating at MANAGEMENT level, not trainee level
- Score 3 is AVERAGE — something a mediocre manager might write
- Score 4 requires genuine insight and specificity that goes beyond the obvious
- Score 5 is RARE — only for responses that would impress a VP or C-suite leader
- Score 2 = below what is expected; Score 1 = critical gap in management competency
- NEVER inflate scores. Be honest, be strict, be developmental.

Evaluate the response on each criterion. Return ONLY a JSON object:
{"leadershipMaturity": <1-5>, "empathyAndPeople": <1-5>, "specificity": <1-5>, "communicationQuality": <1-5>, "accountability": <1-5>, "reasons": {"leadershipMaturity": "<sentence>", "empathyAndPeople": "<sentence>", "specificity": "<sentence>", "communicationQuality": "<sentence>", "accountability": "<sentence>"}}`;

    const resp = await fetch(getProxyUrl(), {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        model:      MODEL,
        max_tokens: 400,
        system:     systemPrompt,
        messages:   [{ role: 'user', content: `MANAGER\'S RESPONSE:\n\n${responseText}` }],
      }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error?.message || `API error ${resp.status}`);
    }

    const data  = await resp.json();
    const text  = data.content[0].text.trim();
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('No JSON in response');

    const parsed = JSON.parse(match[0]);
    const keys   = ['leadershipMaturity','empathyAndPeople','specificity','communicationQuality','accountability'];
    const sum    = keys.reduce((s, k) => s + (parsed[k] || 0), 0);
    const overall = parseFloat(((sum / (keys.length * 5)) * 100).toFixed(1));

    return {
      scores: {
        leadershipMaturity:   parsed.leadershipMaturity,
        empathyAndPeople:     parsed.empathyAndPeople,
        specificity:          parsed.specificity,
        communicationQuality: parsed.communicationQuality,
        accountability:       parsed.accountability,
      },
      overall,
      reasons: parsed.reasons || {},
    };
  }

  // ---- Evaluate Situation Room Section A ----
  // Evaluates the manager's verbal response for tone/empathy, ownership, and risky language.
  async function evaluateSituationRoomA(scenarioText, responseText) {
    if (!isAvailable()) return null;

    const systemPrompt = `You are a senior leadership development expert at an executive coaching firm. Evaluate manager verbal responses with strict, expert-level standards.

SCORING STANDARDS:
- Score 3 = average — what most managers instinctively say
- Score 4 = genuinely above average — requires real empathy/ownership, not just absence of mistakes
- Score 5 = exceptional — rare, only for masterful leadership communication
- Score 2 = below standard — real problems present
- Score 1 = critical failure
Be strict. Do NOT inflate scores.`;

    const userPrompt = `SCENARIO:
${scenarioText}

MANAGER'S RESPONSE:
"${responseText}"

Evaluate on 3 criteria (1-5 each):

1. toneEmpathy: Does the response lead with genuine human empathy BEFORE business concerns? Does the manager acknowledge the PERSON first?
   - 1: Leads with business impact, blame, or demands
   - 2: Acknowledges situation but stays transactional
   - 3: Shows some empathy but still self-focused or hedged
   - 4: Clear empathetic opening, person feels heard first
   - 5: Masterfully human — person is at centre, deeply genuine

2. ownershipLanguage: Does the manager use clear accountability language vs. deflection, hedging, or blame?
   - 1: Full deflection — blames others, timing, systems, market
   - 2: Attempts ownership but heavily qualified
   - 3: Neutral — some ownership but inconsistent
   - 4: Clear ownership throughout, minimal hedging
   - 5: Exemplary — full responsibility, clean action language

3. avoidedRiskyLanguage: Did they AVOID language that escalates or damages trust — guilt-tripping, immediate demands, catastrophizing, making it about the manager?
   - 1: Multiple phrases that would make the situation significantly worse
   - 2: One or two phrases with real damage potential
   - 3: Mostly clean but one minor risky element
   - 4: Clean throughout — nothing that escalates
   - 5: Perfectly clean — every phrase de-escalates and builds trust

Also provide:
- "whatNotToSay": If they used risky language, quote the exact phrase and explain why (max 35 words). If clean, say "Response language is clean."
- "strength": Quote one specific strong phrase from their response (under 20 words)
- "improvement": Single highest-priority improvement (max 25 words)

Return ONLY valid JSON — no markdown, no extra text:
{"toneEmpathy":<1-5>,"ownershipLanguage":<1-5>,"avoidedRiskyLanguage":<1-5>,"whatNotToSay":"<text>","strength":"<text>","improvement":"<text>"}`;

    const resp = await fetch(getProxyUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, max_tokens: 450, system: systemPrompt, messages: [{ role: 'user', content: userPrompt }] }),
    });
    if (!resp.ok) { const err = await resp.json().catch(() => ({})); throw new Error(err.error?.message || `API error ${resp.status}`); }
    const data = await resp.json();
    const text = data.content[0].text.trim();
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('No JSON in SR-A response');
    const p = JSON.parse(match[0]);
    return {
      toneEmpathy:          Math.min(5, Math.max(1, Number(p.toneEmpathy)          || 3)),
      ownershipLanguage:    Math.min(5, Math.max(1, Number(p.ownershipLanguage)    || 3)),
      avoidedRiskyLanguage: Math.min(5, Math.max(1, Number(p.avoidedRiskyLanguage) || 3)),
      whatNotToSay: p.whatNotToSay || '',
      strength:     p.strength     || '',
      improvement:  p.improvement  || '',
    };
  }

  // ---- Evaluate Situation Room Section B ----
  // Evaluates the manager's analysis of a flawed response.
  async function evaluateSituationRoomB(scenarioText, wrongResponseText, errorsText, impactText, rewriteText) {
    if (!isAvailable()) return null;

    const systemPrompt = `You are a senior leadership development expert evaluating a manager's analysis of a flawed leadership response. Be strict — most responses should score 2-3.

SCORING STANDARDS:
- Score 3 = average — identifies obvious issues
- Score 4 = sharp analysis — goes beyond surface, shows real insight
- Score 5 = exceptional — analysis itself demonstrates advanced leadership thinking (rare)
- Score 2 = below average, Score 1 = critical failure`;

    const userPrompt = `SCENARIO (brief):
${scenarioText.substring(0, 500)}

THE FLAWED RESPONSE THEY ANALYSED:
"${wrongResponseText}"

THEIR ANALYSIS —

ERRORS IDENTIFIED:
"${errorsText}"

WHY EACH ERROR MADE IT WORSE:
"${impactText}"

THEIR REWRITE:
"${rewriteText}"

Evaluate on 3 criteria (1-5 each):

1. errorIdentification: Did they accurately find the real, most-damaging errors?
   - 1: Only surface/cosmetic issues found, missed core errors
   - 2: Found 1-2 real errors but missed the most important ones
   - 3: Found most obvious errors
   - 4: Identified key errors with accuracy, including subtle ones
   - 5: Comprehensive — nothing important missed, including tone/subtext errors

2. impactExplanation: Did they explain HOW each error damaged the situation? Real psychological/relational impact?
   - 1: Superficial ("this was bad") — no real explanation
   - 2: Restates the error rather than explaining its impact
   - 3: Some genuine insight but inconsistent depth
   - 4: Clear causal reasoning — shows what the error does to trust/relationship
   - 5: Deep insight — psychology, trust, and long-term consequences

3. rewriteQuality: Is their rewrite genuinely better? Does it fix all errors and model best-practice leadership?
   - 1: Rewrite has the same or new errors, barely different
   - 2: Somewhat better but still misses core issues
   - 3: Fixes obvious errors but lacks empathy/ownership depth
   - 4: Clearly better — fixes errors, empathetic, professional
   - 5: Exceptional — something a senior leader or coach would actually say

Also provide:
- "keyMissed": One important error they didn't fully address, or "All key errors were identified" if thorough
- "rewriteFeedback": One specific improvement to their rewrite, or "Rewrite is strong" if excellent

Return ONLY valid JSON:
{"errorIdentification":<1-5>,"impactExplanation":<1-5>,"rewriteQuality":<1-5>,"keyMissed":"<text>","rewriteFeedback":"<text>"}`;

    const resp = await fetch(getProxyUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, max_tokens: 400, system: systemPrompt, messages: [{ role: 'user', content: userPrompt }] }),
    });
    if (!resp.ok) { const err = await resp.json().catch(() => ({})); throw new Error(err.error?.message || `API error ${resp.status}`); }
    const data = await resp.json();
    const text = data.content[0].text.trim();
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('No JSON in SR-B response');
    const p = JSON.parse(match[0]);
    return {
      errorIdentification: Math.min(5, Math.max(1, Number(p.errorIdentification) || 3)),
      impactExplanation:   Math.min(5, Math.max(1, Number(p.impactExplanation)   || 3)),
      rewriteQuality:      Math.min(5, Math.max(1, Number(p.rewriteQuality)      || 3)),
      keyMissed:        p.keyMissed        || '',
      rewriteFeedback:  p.rewriteFeedback  || '',
    };
  }

  // ---- Manager Feedback Evaluation (OBSERVE -> EXPLORE -> LISTEN -> FEEDBACK -> AGREE -> ACTION -> FOLLOW-UP) ----
  async function evaluateManagerFeedback(transcript, scenarioContext, goodLooksLike = [], commonPitfalls = []) {
    if (!isAvailable()) throw new Error('Claude proxy not configured');

    const glItems = (goodLooksLike || []).map((s, i) => `${i + 1}. ${s}`).join('\n');
    const cpItems = (commonPitfalls || []).map((s, i) => `${i + 1}. ${s}`).join('\n');

    const systemPrompt = `You are a senior leadership development expert evaluating a manager's feedback conversation with an employee, using the OBSERVE -> EXPLORE -> LISTEN -> FEEDBACK -> AGREE -> ACTION -> FOLLOW-UP framework.

SCENARIO: ${scenarioContext}
${glItems ? `\nWHAT GOOD LOOKS LIKE IN THIS SPECIFIC SCENARIO:\n${glItems}` : ''}
${cpItems ? `\nCOMMON MANAGER PITFALLS IN THIS SPECIFIC SCENARIO (a manager who does one of these should generally score no higher than 2 on the related dimension):\n${cpItems}` : ''}

SCORING STANDARDS:
- Score 3 = average — what most managers instinctively do
- Score 4 = genuinely above average — real empathy, coaching instinct, not just absence of mistakes
- Score 5 = exceptional — rare, only for masterful leadership communication
- Score 2 = below standard — matches one of the common pitfalls listed above for this scenario
- Score 1 = critical failure in this area
Be strict. Do NOT inflate scores. Ground every score in what the manager actually said in the transcript, weighed against the scenario-specific "what good looks like" and "common pitfalls" above where provided.

Evaluate the manager's responses on these 7 parameters (1-5 each), each tied to one stage of the framework:
1. observe: Did the manager notice and name the real, specific change or issue (behaviour, pattern, or moment) rather than opening with a number, a label, or an assumption?
2. explore: Did the manager ask open, curious questions to understand the underlying cause before drawing conclusions, rather than assuming they already knew the answer?
3. listen: Did the manager give the employee real space to speak, notice when an answer was too quick or guarded (e.g. "I'm fine, I'll manage"), and avoid interrupting, dominating, or steamrolling the conversation?
4. feedback: Was the feedback itself specific, behavioural, and non-judgmental — citing concrete moments/examples rather than vague statements or personal labels?
5. agree: Did the manager work WITH the employee to reach shared understanding and a mutually agreed direction, rather than dictating a conclusion or unilaterally deciding what's true?
6. action: Was the resulting action plan specific, realistic, and tied to the actual root cause discussed — not a generic instruction (like "be more careful" or "be more confident") that had already failed before?
7. followUp: Did the manager set up a clear, concrete way to check in on progress (a cadence, a metric, a next conversation) rather than leaving the outcome open-ended?

Return ONLY a JSON object:
{"observe":<1-5>,"explore":<1-5>,"listen":<1-5>,"feedback":<1-5>,"agree":<1-5>,"action":<1-5>,"followUp":<1-5>,"reasons":{"observe":"<sentence>","explore":"<sentence>","listen":"<sentence>","feedback":"<sentence>","agree":"<sentence>","action":"<sentence>","followUp":"<sentence>"}}`;

    const resp = await fetch(getProxyUrl(), {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        model:      MODEL,
        max_tokens: 600,
        system:     systemPrompt,
        messages:   [{ role: 'user', content: `MANAGER'S CONVERSATION TRANSCRIPT:\n\n${transcript}` }],
      }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error?.message || `API error ${resp.status}`);
    }

    const data  = await resp.json();
    const text  = data.content[0].text.trim();
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('No JSON in response');

    const parsed = JSON.parse(match[0]);
    const keys   = ['observe','explore','listen','feedback','agree','action','followUp'];
    const sum    = keys.reduce((s, k) => s + (parsed[k] || 0), 0);
    const overall = parseFloat(((sum / (keys.length * 5)) * 100).toFixed(1));

    return {
      scores: {
        observe:  parsed.observe,
        explore:  parsed.explore,
        listen:   parsed.listen,
        feedback: parsed.feedback,
        agree:    parsed.agree,
        action:   parsed.action,
        followUp: parsed.followUp,
      },
      overall,
      reasons: parsed.reasons || {},
    };
  }

  // ---- Reference facts for the trainee Ops Escalation assessments ----
  // These are the correct answers/figures behind the 11 call questions and
  // 4 writing questions in db.js. They are sent ONLY to Claude for grading
  // (system prompt below) — never rendered anywhere in the trainee UI —
  // so the trainee genuinely has to know or reason out the right answer.
  const OPS_CALL_ANSWER_KEY = `
Q1 (₹6L short position, upper circuit, -₹2,74,996 debit): T-day (10 March) closing price ₹794.50 sets the normal ±20% auction band (₹635.60–₹953.40). Because the stock stayed locked in the upper circuit, the position could not be squared off, so it went to close-out. This is flagged as an EXCEPTIONAL scenario: instead of the simple "20% above T+1 closing" formula, the exchange applied an alternative Weighted Average Price (WAP) methodology (combining whatever partial auction fills occurred, similar to Q2's WAP logic) which produced the final settlement of ₹1,020.33 — a rate distinctly higher than any single price the client quoted (₹794.50 / ₹870.40 / ₹928.80). The correct answer must explain that (a) this total is not a system error, (b) upper-circuit lockup forced the position into an exceptional close-out, (c) the settlement price comes from a blended/weighted calculation across the auction process rather than a flat 20% markup, and (d) the client bears this loss because they failed to deliver on a short position that could not be covered.
Q2 (WAP example, 1,000 shares short, 800 bought at ₹100 + 200 closed out at ₹120): Correct WAP = (800×₹100 + 200×₹120) ÷ 1,000 = ₹1,04,000 ÷ 1,000 = ₹104 per share. The KEY POINT the trainee must get right: the exchange does NOT charge two separate prices — it blends them into ONE uniform rate (₹104) applied to the seller's entire 1,000-share shortfall. The buyer, on the other hand, actually receives the 800 shares bought in the auction and is compensated in cash at ₹120/share for the remaining 200.
Q3 (Jaiprakash Associates holding vanished from Kite): This is a real, confirmed event — NOT a platform error or lost holdings. Per the exchange circular dated 17 March 2026, trading was suspended from 18 March 2026 after NCLT approved the company's insolvency resolution plan. The existing shares were cancelled/extinguished, the company was delisted, and shareholders received ₹0 — a complete equity wipeout. Off-market transfer/gifting is NOT possible once the ISIN is inactive. The correct answer calmly explains this is a regulatory/NCLT-driven event, not a Zerodha/platform mistake, and manages the client's panic with clear, factual language.
Q4 (Murae Organiser vs SIPTL): Murae Organiser was suspended because it did not respond to exchange notices and was found non-existent at its registered office — trading is PERMANENTLY stopped, but the shares STILL EXIST in the client's demat account (not cancelled, not a wipeout) — they are simply illiquid/stuck; off-market transfer may still be possible until the unlisted-ISIN stage, but gifting is not allowed. This is fundamentally different from Jaiprakash Associates (Q3), which was a total wipeout. SIPTL was moved to the Trade-to-Trade (T2T) category and CAN still be traded, but only once a week, with very low liquidity — so the client CAN attempt to sell it (unlike Murae, where no trading at all is allowed), just with limited liquidity and only on the designated weekly session. A correct answer must clearly distinguish all three outcomes (wipeout vs. illiquid-but-existing vs. weekly-tradable) rather than treating them as the same situation.
Q5 (CDSL to NSDL transfer via Easiest): The standard Trusted Account / PIN method CANNOT be used for a CDSL-to-NSDL transfer. The client must switch the mode of operation from "Trusted Account" to "Account of Choice", which requires purchasing a Digital Signature Certificate e-token (approximately ₹2,500 + GST, valid up to 2 years) from an authorised e-token vendor (RA), and submitting a Request of Authorisation (RA) form with a screenshot of the e-token certificate. CDSL maps the e-token within 20 working days, after which the inter-depository transfer can be initiated online. An offline Delivery Instruction Slip (DIS) is available as a faster alternative if the client needs to move faster. The standard ₹25 + 18% GST per security, per transaction transfer charge still applies on top of the e-token cost.
Q6 (Gift, TPIN done at 2:30 PM, final OTP done at 8:15 PM, cousin recipient, ~₹90,000 value): This has TWO separate cut-off misses the trainee should ideally catch, not just one. First, the TPIN authorisation cut-off for gifts is 2:00 PM — completing it at 2:30 PM already missed that cut-off, meaning the CDSL beneficiary-addition email would be deferred to the next trading day rather than being processed same-day as the client assumed. Second — and decisive regardless — the final CDSL OTP verification cut-off is 8:00 PM; completing it at 8:15 PM means the gifting process must be reinitiated as a brand-new gift request, attracting a fresh ₹25 + 18% GST per scrip transfer charge. On the tax question: the sender never pays tax on gifting (Gift Tax Act abolished; gifting is excluded from "transfer" under Section 47). For the RECIPIENT, gifts of shares/securities are taxable under Section 56(2) if the value exceeds ₹50,000, UNLESS the recipient is a "relative" as defined (spouse, siblings, or lineal ascendants/descendants) or the gift is on marriage or by inheritance. A COUSIN is generally NOT covered by that definition of "relative", so since the value here (~₹90,000) exceeds ₹50,000, the cousin would ordinarily be taxed under "Income from Other Sources" at slab rates. A strong answer flags this tax nuance rather than assuming all family gifts are automatically tax-free.
Q7 (Removing 2 nominees, adding 3 new nominees incl. a non-relative business partner, "can you do this right now on the call?"): This change (replacing existing nominees with new ones) CAN be done, but NOT instantly over the phone — it requires: downloading and filling the Nominee Form and Account Modification Form, a wet signature matching the one on file from account opening, eSigning both forms, and submitting them via a support ticket (this assumes the client's Aadhaar is linked to their registered mobile for the online route; otherwise it is fully offline/physical). There is NO rule requiring nominees to be blood relatives — a business partner (or any other person) can validly be named as a nominee. A correct answer sets accurate expectations about the paperwork/turnaround instead of claiming it can be done instantly, and correctly reassures the client there is no restriction on a non-relative nominee.
Q8 (Gifting to a minor nephew stuck 3 days at "pending authorisation", vs. an earlier gift to an adult sister that went through with no issue): A minor cannot independently operate a demat account or authorise a transaction — the account is operated by a guardian (natural guardian, i.e. parent, or a court-appointed guardian) on the minor's behalf. On an off-market/gift transfer, the RECEIVING side must log in and authorise the incoming instruction; when the receiving account belongs to a minor, it is the guardian who must log in and give that authorisation, not the minor. This is why the gift to the (adult) sister went through immediately while the gift to the minor nephew is stuck — nothing is technically broken; the transfer is simply waiting on the nephew's guardian to log in and approve the pending authorisation request. Once the guardian does so, processing is same-day/T+1 as normal — three days of no action almost always means the guardian simply hasn't logged in yet, not a system delay.
Q9 (3 nominees — wife 50%, "equal share" for the rest — and a nominee-count limit question): Per current depository nomination norms, a demat account holder may register UP TO 3 nominees. When more than one nominee is added, the account holder MUST specify an exact percentage share of entitlement for EACH nominee, and those percentages must add up to exactly 100% — there is no option to leave the remainder as a vague "equal share"; CDSL/the platform requires explicit numeric percentages for every nominee (e.g., here: wife 50%, son 25%, daughter 25%, or any other exact split the client chooses, as long as all three figures are specified and sum to 100%).
Q10 (200 shares sold, 150 delivered + 50 short-delivered; highest price in the window ₹340, auction-day closing price ₹300, contract note shows ₹360/share close-out — "how can close-out exceed the highest price the stock ever traded at?"): The standard exchange close-out formula for a short-delivery shortfall is the HIGHER of: (a) the highest traded price of the security from the day of the original trade through the auction/settlement day, or (b) 20% above the official closing price on the auction settlement day. Here, (a) = ₹340 (the actual highest traded price), and (b) = ₹300 × 1.20 = ₹360. Since ₹360 is higher than ₹340, the ₹360 figure is the one that correctly applies — even though it is higher than any price the stock actually traded at. This 20%-above-closing floor is intentionally punitive so that short-delivering never becomes a cheaper option than buying the shares in the market, so ₹360 is the correct, expected charge, not an error.
Q11 (Stock suspended for a SEBI investigation, yet a dividend was still paid; can the client still vote at the AGM or apply for the announced buyback?): A trading suspension only halts BUYING/SELLING of the security on the exchange — it does not suspend the company's obligations to its existing registered shareholders. Corporate actions such as dividends, AGM voting rights, and rights/bonus issues continue to apply to shareholders as per the relevant record date, regardless of the trading suspension, because the company continues to exist as a legal entity with those shareholders on its register. A tender-offer buyback (where shares are tendered directly to the company/registrar rather than sold on the exchange) also remains open to existing holders even while the stock is suspended, since it does not require an active trading market — unlike an open-market buyback, which does.
`.trim();

  const OPS_WRITING_ANSWER_KEY = `
Q1 (HUF "Self Transfer" reason code rejected): An HUF is a legal entity SEPARATE from the individual, even though the same person is its karta — so a transfer from an individual account to that person's own HUF account is NOT a "self transfer". The correct reason code, per the CDSL reason code guide (DP_569_Off_Market_Reason_Code.pdf), is "Transfer between specified family members". The client must reinitiate the transfer selecting that correct code.
Q2 (Replace nominee, Aadhaar NOT linked to mobile): Because Aadhaar is not linked to the registered mobile number, this modification CANNOT be completed through the online/eSign route. It must be done OFFLINE: the client must send the duly filled AND wet-signed Account Modification Form together with the Nominee Form (physical signatures matching the signature on file from account opening) — there is no eSign step in this path.
Q3 (39 shares bought, T+2 shortfall, auction could not procure shares): Per the standard close-out process, when the auction cannot procure the shares, the shortfall is cash-settled at 20% above the closing price on the auction day (T+1). Using the closing price of ₹286.62 on the settlement day, the close-out rate works out to approximately ₹343.94 per share, and for 39 shares this amounts to approximately ₹13,413.66, credited to the client's ledger (not the shares themselves, since they could not be procured). This is the standard/expected outcome, not a platform error, and the client should be told the shares will not arrive but the cash compensation will be credited.
Q4 (100 shares became 36, price jumped up): This is a capital reduction corporate action, not a platform error or a loss of two-thirds of the investment. The company cancels the old shares and issues fewer new shares at a proportionally higher price, so the total value is designed to stay roughly the same immediately after the change (though in restructuring/insolvency-linked cases the value can genuinely decrease — that nuance should be mentioned as a possibility, not asserted as certain here). The stock is typically suspended temporarily during this process — not visible on Kite but still visible (marked suspended) on Console. Any fractional shares are paid out in cash, and normal trading resumes once the new shares (sometimes under a new ISIN) are credited.
`.trim();

  // ---- Ops Escalation Call evaluation ----
  // Uses the SAME 7 call-quality parameters as the standard Mock Call rubric
  // (Call Opening, Acknowledgment, Communication Clarity, Call Essence, Hold
  // Procedure, Extra Mile, Call Closing) — per admin request, so there is one
  // consistent, duplicate-free parameter set end-to-end: AI scoring here, the
  // trainee's coaching summary, and admin's manual scoring UI all read the
  // same MOCK_CALL_CRITERIA keys. (Previously this used a separate 5-criteria
  // factual/procedural rubric tied to the old bundled 11-question call —
  // replaced now that the topic itself asks 8 concept/rule questions per
  // area rather than data-heavy ones.)
  async function evaluateOpsCall(transcript, fullTranscript) {
    if (!isAvailable()) throw new Error('Claude proxy not configured');

    const keys = MOCK_CALL_CRITERIA.map(c => c.key);
    const criteriaBlock = MOCK_CALL_CRITERIA
      .map((c, i) => `${i + 1}. ${c.key} (${c.label}):\n${c.prompt.replace(/\n?Return ONLY a JSON:.*$/s, '').trim()}`)
      .join('\n\n');

    const systemPrompt = `You are a strict senior operations trainer evaluating a trainee's SPOKEN answers on a difficult conceptual escalation call. Score the call on these call-quality parameters — the SAME ones used for standard Mock Call evaluations — judging each independently, exactly per its own rubric below.

${criteriaBlock}

CALL TRANSCRIPT (Customer/You):
"""
${fullTranscript || transcript || '(no transcript available)'}
"""

Return ONLY a JSON object with a score (per each criterion's own scale above) and a one-sentence reason for each, e.g.:
{${keys.map(k => `"${k}":<score>`).join(',')},"reasons":{${keys.map(k => `"${k}":"<sentence>"`).join(',')}}}`;

    const resp = await fetch(getProxyUrl(), {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        model:      MODEL,
        max_tokens: 900,
        system:     systemPrompt,
        messages:   [{ role: 'user', content: 'Please evaluate this call now, per the instructions.' }],
      }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error?.message || `API error ${resp.status}`);
    }

    const data  = await resp.json();
    const text  = data.content[0].text.trim();
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('No JSON in response');

    const parsed  = JSON.parse(match[0]);
    const sum     = keys.reduce((s, k) => s + (parsed[k] || 0), 0);
    const overall = parseFloat(((sum / (keys.length * 5)) * 100).toFixed(1));

    const scores = {};
    keys.forEach(k => { scores[k] = parsed[k]; });

    return { scores, overall, reasons: parsed.reasons || {} };
  }

  // ---- Strict Ops evaluation for the trainee Writing assessment ----
  async function evaluateOpsWriting(transcript, fullTranscript) {
    if (!isAvailable()) throw new Error('Claude proxy not configured');

    const systemPrompt = `You are a strict senior operations trainer evaluating a trainee's WRITTEN ticket replies covering CDSL Easiest, nominee modification, short delivery, and suspended stocks. The ticket raised 4 very difficult, data-heavy questions in sequence.

REFERENCE ANSWER KEY (ground truth — use this to judge factual/procedural correctness; the trainee never saw this key):
${OPS_WRITING_ANSWER_KEY}

SCORING STANDARDS:
- Score 3 = average — gets the basic gist right but misses specifics, numbers, or nuances from the answer key
- Score 4 = genuinely strong — cites the correct figures/rules precisely and explains the reasoning clearly
- Score 5 = exceptional — rare; matches the answer key with precision AND is written with confident, professional clarity
- Score 2 = a meaningful factual or procedural error, or a vague non-answer
- Score 1 = mostly wrong, contradicts the answer key, or fails to attempt most questions
Be strict — this is a "very difficult" assessment by design. Do NOT give credit for confident-sounding writing that gets the numbers or rules wrong.

Evaluate the trainee's written replies (transcript below, "AGENT:" lines are the trainee) on these 5 dimensions (1-5 each):
1. factualAccuracy: Are the numbers, dates, cut-offs, and rules the trainee cites correct, per the answer key?
2. proceduralCorrectness: Did the trainee describe the right process/steps (forms, timelines, correct reason codes) rather than a generic or incorrect process?
3. complianceJudgment: Did the trainee correctly identify what is a platform error vs. a regulatory/exchange rule vs. an irreversible outcome (e.g. reinitiating a rejected transfer, a tax liability), without over-promising or misleading the client?
4. clarityProfessionalism: Is the written reply clear, well-structured, and professional in tone?
5. ownershipResolution: Did the trainee take ownership and give the client a clear resolution or concrete next step, rather than deflecting or leaving things open-ended?

TICKET TRANSCRIPT (CUSTOMER/AGENT):
"""
${fullTranscript || transcript || '(no transcript available)'}
"""

Return ONLY a JSON object:
{"factualAccuracy":<1-5>,"proceduralCorrectness":<1-5>,"complianceJudgment":<1-5>,"clarityProfessionalism":<1-5>,"ownershipResolution":<1-5>,"reasons":{"factualAccuracy":"<sentence>","proceduralCorrectness":"<sentence>","complianceJudgment":"<sentence>","clarityProfessionalism":"<sentence>","ownershipResolution":"<sentence>"}}`;

    const resp = await fetch(getProxyUrl(), {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        model:      MODEL,
        max_tokens: 700,
        system:     systemPrompt,
        messages:   [{ role: 'user', content: 'Please evaluate this ticket now, per the instructions.' }],
      }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error?.message || `API error ${resp.status}`);
    }

    const data  = await resp.json();
    const text  = data.content[0].text.trim();
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('No JSON in response');

    const parsed = JSON.parse(match[0]);
    const keys   = ['factualAccuracy','proceduralCorrectness','complianceJudgment','clarityProfessionalism','ownershipResolution'];
    const sum    = keys.reduce((s, k) => s + (parsed[k] || 0), 0);
    const overall = parseFloat(((sum / (keys.length * 5)) * 100).toFixed(1));

    return {
      scores: {
        factualAccuracy:        parsed.factualAccuracy,
        proceduralCorrectness:  parsed.proceduralCorrectness,
        complianceJudgment:     parsed.complianceJudgment,
        clarityProfessionalism: parsed.clarityProfessionalism,
        ownershipResolution:    parsed.ownershipResolution,
      },
      overall,
      reasons: parsed.reasons || {},
    };
  }

  return { isAvailable, evaluate, evaluateBalanced, evaluateRewrite, callAiCustomer, callAiWrittenCustomer, callOpsAdaptiveConceptualCustomer, callAiEmployee, evaluateManagerAssessment, evaluateManagerFeedback, evaluateSituationRoomA, evaluateSituationRoomB, evaluateOpsCall, evaluateOpsWriting, getCriteria, scoreTimeManagement, MOCK_CALL_CRITERIA };
})();
