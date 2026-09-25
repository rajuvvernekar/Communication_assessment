'use strict';
// ============================================================
//  CommAssess — Manager Assessment Evaluation Parameters
//  Source: "Communicate 360° — Manager Assessment Scenario Bank &
//  Evaluation Parameters" (broking-industry manager assessment doc,
//  2026-09-19). Single shared source of truth, loaded before
//  admin.js, claude.js and manager-app.js so all three read the same
//  parameter names, weights and descriptions — no drift between what
//  the AI scores, what the admin scores, and what the manager is
//  shown before taking the assessment.
//
//  Every assessment totals 50 marks. Each parameter is scored 0-100%
//  of its own weight (not a flat 1-5), matching the doc's "Score each
//  parameter 0–100% of its weight; do not round to whole marks until
//  all parameters are scored" guidance.
// ============================================================
const MGR_EVAL_CRITERIA = {
  'mgr-situation-room': {
    label: 'The Situation Room',
    format: 'Written',
    maxMarks: 50,
    parameters: [
      { key: 'openingToneEmpathy', label: 'Opening Tone & Empathy (first 60 seconds)', weight: 10,
        desc: 'Acknowledges the customer\'s loss/distress by name in the first two sentences; no defensiveness, no jargon, no minimizing language ("it\'s not a big deal", "these things happen")' },
      { key: 'ownershipAccountability', label: 'Ownership & Accountability Language', weight: 10,
        desc: 'Uses first-person ownership ("I will personally...", "here is what went wrong on our end...") instead of passive voice or blame-shifting to "the system", "the exchange", or "technical team"' },
      { key: 'escalationControl', label: 'Escalation Control & Composure', weight: 8,
        desc: 'Response de-escalates rather than provokes; no matching the customer\'s aggression; sets a calm, confident, unhurried tone throughout' },
      { key: 'regulatoryAccuracy', label: 'Regulatory & Policy Accuracy', weight: 8,
        desc: 'No over-promising (refunds, compensation, timelines) beyond what policy and SEBI/exchange regulations allow; correct reference to grievance mechanisms (SCORES, Exchange Investor Grievance, Ombudsman) where relevant' },
      { key: 'errorIdCritique', label: 'Error Identification & Critique Quality (Part B)', weight: 8,
        desc: 'Correctly identifies all planted errors in the flawed response; explains the customer-experience or compliance impact of each, not just labels it "wrong"' },
      { key: 'resolutionClarity', label: 'Resolution Clarity & Structure', weight: 6,
        desc: 'Their errors/impact analysis clearly lays out what should have happened instead — concrete next steps, owners and timelines — not just what was wrong' },
    ],
  },
  'mgr-transcript-autopsy': {
    label: 'The Transcript Autopsy',
    format: 'Written',
    maxMarks: 50,
    parameters: [
      { key: 'errorIdCompleteness', label: 'Error Identification — Completeness', weight: 15,
        desc: 'Every planted error is caught (see calibration notes per transcript); partial credit for errors found without the underlying reasoning' },
      { key: 'errorIdReasoning', label: 'Error Identification — Diagnostic Reasoning', weight: 10,
        desc: 'Explains the impact of each error (trust, compliance exposure, escalation risk) rather than simply labelling it "rude" or "wrong"' },
      { key: 'turningPointAccuracy', label: 'Turning-Point Accuracy', weight: 8,
        desc: 'Selects the genuine inflection point (not just the first or last mistake) and shows why that specific line was the moment recovery became harder' },
      { key: 'rewrittenCloseTone', label: 'Rewritten Close — Tone & Ownership', weight: 10,
        desc: 'The rewritten close uses first-person accountability, empathetic language, and no blame-shifting to "other departments" or "policy"' },
      { key: 'rewrittenCloseResolution', label: 'Rewritten Close — Resolution & Compliance', weight: 7,
        desc: 'Rewritten close gives a concrete next step, timeline, and owner, without over-promising outcomes the manager cannot guarantee' },
    ],
  },
  'mgr-mock-call': {
    label: 'The Paper Trade',
    format: 'Verbal',
    maxMarks: 50,
    parameters: [
      { key: 'openingRapport', label: 'Opening & Rapport (first exchange)', weight: 8,
        desc: 'Greets by name, states understanding of the issue before defending or explaining anything' },
      { key: 'empathyUnderPressure', label: 'Empathy Under Pressure', weight: 10,
        desc: 'Sustains empathetic language even as the customer escalates; does not become clipped or robotic under pressure' },
      { key: 'ownershipAccountability', label: 'Ownership & Accountability', weight: 8,
        desc: 'Takes personal/organizational ownership without deflecting to "the system", "policy", or other departments' },
      { key: 'resolutionQuality', label: 'Resolution Quality & No Over-Promising', weight: 12,
        desc: 'Resolution is realistic, policy-compliant, and specific (owner + timeline); no guarantees the manager cannot back' },
      { key: 'realTimeComposure', label: 'Real-Time Composure & Tone', weight: 6,
        desc: 'Steady pace, no dead air, no argumentative tone, recovers smoothly if caught off guard' },
      { key: 'closeConfirmation', label: 'Close & Confirmation', weight: 6,
        desc: 'Confirms the customer\'s understanding of next steps and leaves them feeling heard before ending the call' },
    ],
  },
  'mgr-feedback': {
    label: 'The Red Pen',
    format: 'Verbal',
    maxMarks: 50,
    // Replaced 2026-09-24 (per the manager's source document, "red pen
    // (2).docx") with the document's own SMART Feedback Checklist as the
    // 5 scored parameters, instead of the previous generic 5-parameter
    // rubric. Unlike every other module here, the 5 weights below are
    // DEFAULTS ONLY -- each of the 6 scenarios in manager-app.js's
    // SCENARIOS['mgr-feedback'] carries its own `smartWeights` override
    // (still summing to this same 50 marks) reflecting what that specific
    // case is actually testing, per the document's instruction that
    // weightage should vary case to case. evaluateManagerFeedback() in
    // claude.js applies the per-scenario override when present.
    parameters: [
      { key: 'specific', label: 'Specific', weight: 10,
        desc: 'Points to concrete, observable moments or examples (what was said, when) rather than vague statements or general traits' },
      { key: 'measurable', label: 'Measurable', weight: 10,
        desc: 'Frames the ask or plan so progress can actually be tracked, not just left as a general reassurance' },
      { key: 'achievable', label: 'Achievable', weight: 10,
        desc: 'Agrees on a next step the employee can realistically do, scoped to what is actually in their control right now' },
      { key: 'relevant', label: 'Relevant', weight: 10,
        desc: 'Stays focused on what actually matters to this employee\'s specific gap, without drifting into debate or unrelated ground' },
      { key: 'timeBound', label: 'Time-bound', weight: 10,
        desc: 'Closes with a clear timeframe or checkpoint for the next step, not left open-ended' },
    ],
  },
  'mgr-eq': {
    label: 'The Mirror Room',
    format: 'Verbal',
    maxMarks: 50,
    // Replaced 2026-09-20: this module moved from a written 3-question
    // cascade (Self-Awareness / Impulse Control / Empathy & Consistency,
    // scored 17/17/16) to a verbal, conversational-AI roleplay built from
    // the manager's uploaded "Emotional Intelligence Assessment" doc, which
    // scores every scenario on the same 1-5 EI scale and maps each one to
    // one or more of Goleman's five EI competencies. These five parameters
    // (10 each) replace the old three so every scenario -- whichever one is
    // randomly assigned -- is scored consistently across all five, the same
    // way Red Pen's fixed 5-parameter rubric applies regardless of which
    // employee persona comes up.
    parameters: [
      { key: 'selfAwareness', label: 'Self-Awareness', weight: 10,
        desc: 'Notices and names their own emotional trigger honestly, without deflecting, minimizing, or claiming to feel nothing' },
      { key: 'selfRegulation', label: 'Self-Regulation', weight: 10,
        desc: 'Stays composed under acute, time-pressured stress -- pauses and chooses a deliberate response rather than reacting from emotion' },
      { key: 'motivation', label: 'Motivation', weight: 10,
        desc: 'Keeps themselves and others driven through a setback with grounded, specific optimism rather than forced positivity or visible anxiety' },
      { key: 'empathy', label: 'Empathy', weight: 10,
        desc: "Registers the other person's emotional state in real time and responds to the person, not just the business problem" },
      { key: 'socialSkill', label: 'Social Skill', weight: 10,
        desc: "Manages interpersonal conflict or a hard conversation skilfully, balancing individual relationships against the wider team" },
    ],
  },
};

// Cross-assessment scoring language (recommended defaults from the doc) —
// surfaced in the admin scoring modal as guidance text, not enforced in code.
const MGR_EVAL_SCORING_NOTES = [
  'Score each parameter 0–100% of its weight; do not round to whole marks until all parameters are scored.',
  'Flag — rather than automatically fail — any response containing an explicit guarantee, promise, or compensation commitment the manager is not authorized to make; route it for trainer review.',
  'Flag any response that shifts blame onto the customer, another department, or "the system" without also offering ownership; this should cap the Ownership/Empathy-family parameter at 40% regardless of other strengths in the response.',
  'For The Transcript Autopsy, score Error Identification against the calibration notes provided under each transcript, giving partial credit for errors found without full reasoning, and full credit only when both the error and its impact are captured.',
];

// ---- NRI Manager modules (2026-09-25) ----
// The NRI team gets its own copy of three assessments -- Situation Room,
// Transcript Autopsy and Paper Trade -- with their own topic banks, but the
// SAME assessment model (same screens, same rubric, same AI evaluators). So
// each NRI module key is just an alias of its base module: code that needs
// the behaviour asks mgrBaseModule(key), and the rubric object is shared by
// reference so nothing here can drift from the base assessment's scoring.
const MGR_MODULE_BASE = {
  'mgr-nri-situation-room':     'mgr-situation-room',
  'mgr-nri-transcript-autopsy': 'mgr-transcript-autopsy',
  'mgr-nri-mock-call':          'mgr-mock-call',
};
function mgrBaseModule(key) { return MGR_MODULE_BASE[key] || key; }
Object.keys(MGR_MODULE_BASE).forEach(k => { MGR_EVAL_CRITERIA[k] = MGR_EVAL_CRITERIA[MGR_MODULE_BASE[k]]; });

// ---- Internal Data box (2026-09-25) ----
// Client-context details a manager would have in front of them on a real
// escalation (account specifics, timeline, internal guidelines). Stored
// inside the topic's single `scenario` string after this marker, because the
// topics table has no spare column for it and adding one needs a Supabase
// migration -- same embedding trick as the Situation Room "wrong response"
// and Red Pen "Think About" sections. One point per line, "Label: value".
const MGR_INTERNAL_DATA_MARKER = '─── INTERNAL DATA ───';
function mgrSplitInternalData(text) {
  text = text || '';
  const idx = text.indexOf(MGR_INTERNAL_DATA_MARKER);
  if (idx === -1) return { text: text.trim(), internalData: '' };
  return {
    text: text.slice(0, idx).trim(),
    internalData: text.slice(idx + MGR_INTERNAL_DATA_MARKER.length).trim(),
  };
}
function mgrJoinInternalData(text, internalData) {
  const t = (text || '').trim();
  const d = (internalData || '').trim();
  return d ? `${t}\n\n${MGR_INTERNAL_DATA_MARKER}\n${d}` : t;
}

// ---- Trainer demo topics (2026-09-25) ----
// One walk-through topic per assessment, played by trainers (never picked
// for a real assessment, never saved as a submission). Marked by a title
// prefix for the same reason as Internal Data: no spare topics column.
const MGR_DEMO_PREFIX = '[DEMO]';
function mgrIsDemoTitle(title) { return /^\s*\[demo\]/i.test(title || ''); }

if (typeof window !== 'undefined') {
  window.MGR_EVAL_CRITERIA = MGR_EVAL_CRITERIA;
  window.MGR_EVAL_SCORING_NOTES = MGR_EVAL_SCORING_NOTES;
  window.MGR_MODULE_BASE = MGR_MODULE_BASE;
  window.mgrBaseModule = mgrBaseModule;
  window.MGR_INTERNAL_DATA_MARKER = MGR_INTERNAL_DATA_MARKER;
  window.mgrSplitInternalData = mgrSplitInternalData;
  window.mgrJoinInternalData = mgrJoinInternalData;
  window.MGR_DEMO_PREFIX = MGR_DEMO_PREFIX;
  window.mgrIsDemoTitle = mgrIsDemoTitle;
}
