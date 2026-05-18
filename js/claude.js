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
        prompt: `Evaluate spoken fluency on a 1-5 scale. Be STRICT — do not give benefit of the doubt.

Count ALL filler words in the transcript: um, uh, like, you know, basically, actually, right, so (as filler), okay (as filler), hmm, err.
Count ALL unnatural pauses or dead air (shown as "..." or sudden topic breaks).

Scoring rules (MANDATORY):
Score 5: 0–1 filler words. Smooth confident delivery. No dead air.
Score 4: 2 fillers max. Mostly smooth with one brief hesitation.
Score 3: 3–5 filler words OR noticeable pauses. Understandable but clearly hesitant.
Score 2: 6–9 filler words OR multiple long pauses OR choppy delivery.
Score 1: 10+ filler words OR constant hesitation OR long dead air.

STRICT RULE: 3 or more filler words → score MUST be 3 or lower. No exceptions.
Return ONLY JSON: {"score":<1-5>,"reason":"<one sentence stating exact filler count and pacing observation>"}`
      },
      {
        key: 'vocabulary', label: 'Vocabulary & Grammar',
        prompt: `Evaluate vocabulary richness AND grammatical accuracy on a 1-5 scale. Be STRICT.

Count carefully:
(a) Grammatical errors: subject-verb disagreement, wrong tense, missing articles, incorrect prepositions, run-on or incomplete sentences.
(b) Sentence variety: does the speaker repeat the same sentence pattern, or use varied structures?
(c) Word choice: varied and precise vocabulary vs. repetitive simple words?

Scoring rules (MANDATORY):
Score 5: 0–1 grammar errors. Rich varied vocabulary. Strong sentence variety.
Score 4: 2 grammar errors max. Good vocabulary with minor repetition.
Score 3: 3 grammar errors. Score MUST be 3 or lower if 3 errors found. Some vocabulary repetition or limited sentence variety.
Score 2: 4–5 grammar errors. Poor vocabulary, heavily repetitive language.
Score 1: 6+ grammar errors. Very limited vocabulary, monotone sentence structure.

STRICT RULE: 3+ grammatical errors → score MUST be 3 or lower. 5+ errors → score MUST be 2 or lower.
Return ONLY JSON: {"score":<1-5>,"reason":"<one sentence stating grammar error count and vocabulary/variety observation>"}`
      },
      {
        key: 'contentCoverage', label: 'Content Coverage',
        prompt: `Evaluate content coverage and depth on a 1-5 scale. Be STRICT.

Score 5: Covers topic thoroughly with a clear opening, at least 2 specific examples or supporting points, and a conclusive close. Well-structured.
Score 4: Good coverage with a minor gap. At least 1 clear example. Some structure evident.
Score 3: Partial coverage only. Vague or generic points. Lacks examples or conclusion.
Score 2: Very shallow. Barely addresses the topic. No structure or examples.
Score 1: Off-topic or essentially no meaningful content delivered.

Return ONLY JSON: {"score":<1-5>,"reason":"<one sentence on topic coverage and structure>"}`
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

  return { isAvailable, evaluate, evaluateRewrite, callAiCustomer, getCriteria, MOCK_CALL_CRITERIA };
})();
