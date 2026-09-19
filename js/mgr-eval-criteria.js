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
      { key: 'resolutionClarity', label: 'Resolution Clarity, Structure & Close', weight: 6,
        desc: 'Clear next steps with owners and timelines; a close that confirms the customer feels heard and knows what happens next' },
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
    parameters: [
      { key: 'structure', label: 'Structure (Opening, Middle, Close)', weight: 10,
        desc: 'Clear sequence: context set first, specific evidence next, a forward-looking plan last; no jumping straight to criticism' },
      { key: 'empathyRelationship', label: 'Empathy & Relationship Preservation', weight: 10,
        desc: 'Acknowledges the employee\'s effort or context before addressing the gap; tone stays respectful even when direct' },
      { key: 'resilienceUnderPushback', label: 'Resilience Under Pushback', weight: 10,
        desc: 'Holds the standard without escalating conflict when the employee deflects, minimizes, or gets defensive; redirects calmly to facts' },
      { key: 'specificityEvidence', label: 'Specificity & Evidence-Based Feedback', weight: 10,
        desc: 'Cites concrete examples (calls, data, dates) rather than vague generalizations ("you need to do better")' },
      { key: 'forwardPlanSmart', label: 'Forward Plan & Accountability (SMART)', weight: 10,
        desc: 'Ends with a specific, measurable, time-bound improvement plan and a clear follow-up checkpoint' },
    ],
  },
  'mgr-eq': {
    label: 'The Mirror Room',
    format: 'Verbal',
    maxMarks: 50,
    parameters: [
      { key: 'selfAwareness', label: 'Self-Awareness', weight: 17,
        desc: 'Names the specific emotional trigger honestly (frustration, defensiveness, panic) without deflecting, minimizing, or claiming to feel nothing' },
      { key: 'impulseControl', label: 'Impulse Control', weight: 17,
        desc: 'First stated action reflects a pause and deliberate reasoning, not an immediate reactive move driven by urgency or emotional pressure' },
      { key: 'empathyConsistency', label: 'Empathy & Consistency Across All Three', weight: 16,
        desc: 'Considers the human impact on everyone involved in each situation, and the quality of reasoning holds steady from the first situation to the third rather than degrading under cumulative pressure' },
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

if (typeof window !== 'undefined') {
  window.MGR_EVAL_CRITERIA = MGR_EVAL_CRITERIA;
  window.MGR_EVAL_SCORING_NOTES = MGR_EVAL_SCORING_NOTES;
}
