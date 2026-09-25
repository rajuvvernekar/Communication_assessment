'use strict';

if (window.location.search.includes('mockDialogs=true')) {
  window.confirm = function(msg) {
    console.log('[Mock Confirm]', msg);
    if (msg.includes('Delete') || msg.includes('delete') || msg.includes('clear') || msg.includes('Clear')) {
      return true;
    }
    return false; // preserve in reports
  };
  window.prompt = function(msg) {
    console.log('[Mock Prompt]', msg);
    return 'admin123';
  };
}

// ── Master score lookup — Source: "Communicate 360 Master Sheet (1).xlsx" ──
// selfAssessment / aiAudit = weighted component scores
// psScore=Pick&Speak/20, lisScore=Listening/20, mcScore=MockCall/20, gramScore=Grammar/25
// totalScore = grand total out of 100 (all components weighted and summed)
// v35: added individual module scores + 2 new aliases (suma manjunath, saneeth)
// v36: replaced AI Audit nav/section with Comm360 Master Report (team filter + full scores table)
// v38b: Vishal Shivsahay Singh gramScore updated (39.25/100 → 9.8125/25, total 22.09)
// v39:  Per-turn voice recording for bot script turns in mock call topics
// v41:  Fix botScriptAudio save — upload blobs to Storage, embed URLs in bot_script jsonb
// v49:  reScoreSharuqPickSpeak — fuzzy name match, pass timeTaken, handle no-transcript sessions
// v50:  reScoreSharuqPickSpeak — use DB.patch (ai_scores only) to avoid Supabase column errors
// v51:  Final Score column: P&S keeps avg logic; mock/grammar/listening = admin final (AI fallback, no average)
// v52:  reScorePickSpeak — generic for any manager or all teams; stricter Claude criteria in claude.js v14
// v53:  reScorePickSpeak — specific agent names input; bypasses team filter when names are typed
// v54:  resetPickSpeakScores — restore original scores from _prev backup stored inside aiScores
// v55:  resetPickSpeakScores — balanced fallback: re-score with original criteria when no _prev exists
// v56:  reScorePickSpeak — use SpeechEngine (all 12 params) + corrected timeManagement; no Claude API
// v57:  Manager Assessments section: loadMgrAssessments, renderMgrAssessments, openMgrScoreModal, saveMgrScore
// v58: Manager topic tabs in admin Topics section
// v59: openMgrScoreModal — Situation Room two-section display + SR-specific criteria
// v60: Fix "previous batch" + wrong scores for Anoop/Viraj/Sharuq teams:
//      - getMasterScores: added strategy 4 — first+last token prefix match
//      - matchFn: added same first+last token prefix match as pass 3
//      - _TRAINEE_ALIASES: added 30+ entries for all 3 teams covering middle-name drops,
//        compound-first-name splits (Sai Vishal↔Saivishal), and spelling variants
const MASTER_SCORES = {
  // ── Vignesh Baliga ──
  "abdul razak":                     { selfAssessment: 9.243,  aiAudit: 3.945,  psScore: 12.68, lisScore: 16.20, mcScore:  8.58, gramScore:  7.00, totalScore: 57.65 },
  "love preet singh":                { selfAssessment: 7.892,  aiAudit: 3.705,  psScore: 11.72, lisScore: 14.40, mcScore:  null, gramScore:  6.25, totalScore: 43.97 },
  "mohit sharma":                    { selfAssessment: 8.324,  aiAudit: 4.005,  psScore: 12.00, lisScore: 15.60, mcScore:  8.58, gramScore:  7.50, totalScore: 56.01 },
  "avinash bhagwanrao pawde":        { selfAssessment: 6.541,  aiAudit: 3.665,  psScore: 13.34, lisScore: 14.00, mcScore:  9.14, gramScore: 10.25, totalScore: 56.94 },
  "vijay kumar n":                   { selfAssessment: 7.459,  aiAudit: 3.765,  psScore: 12.10, lisScore: 14.20, mcScore:  9.14, gramScore:  7.50, totalScore: 54.16 },
  "k g saroj":                       { selfAssessment: 6.541,  aiAudit: 3.825,  psScore: 12.78, lisScore: 17.00, mcScore:  8.58, gramScore: 14.50, totalScore: 63.23 },
  "ayachi mishra":                   { selfAssessment: 8.703,  aiAudit: 3.885,  psScore: 11.30, lisScore: 17.00, mcScore:  9.72, gramScore: 13.50, totalScore: 64.11 },
  // ── Harish V ──
  "naveenkumar ayyangoudar":         { selfAssessment: 7.459,  aiAudit: 3.945,  psScore: 11.92, lisScore: 12.80, mcScore:  8.66, gramScore: 10.25, totalScore: 55.03 },
  "indranil bose":                   { selfAssessment: 8.649,  aiAudit: 3.965,  psScore: 14.74, lisScore: 16.40, mcScore: 12.00, gramScore: 11.25, totalScore: 67.00 },
  "seema k s":                       { selfAssessment: 9.351,  aiAudit: 4.020,  psScore: 11.46, lisScore: 13.00, mcScore: 10.00, gramScore:  7.75, totalScore: 55.58 },
  "d karthik":                       { selfAssessment: 9.405,  aiAudit: 3.810,  psScore: 13.66, lisScore: 17.40, mcScore:  6.66, gramScore: 13.00, totalScore: 63.94 },
  "anupama h":                       { selfAssessment: 9.514,  aiAudit: 4.005,  psScore: 11.74, lisScore: 17.00, mcScore: 12.00, gramScore: 12.50, totalScore: 66.76 },
  "stavan bhardwaj":                 { selfAssessment: 9.189,  aiAudit: 4.140,  psScore: 14.00, lisScore: 19.00, mcScore: 10.66, gramScore: 15.50, totalScore: 72.49 },
  "n s sindhu":                      { selfAssessment: 8.865,  aiAudit: 3.855,  psScore: 12.84, lisScore: 15.00, mcScore: 11.34, gramScore:  5.50, totalScore: 57.40 },
  "shefali tyagi":                   { selfAssessment: 18.500, aiAudit: 3.725,  psScore: 11.20, lisScore: 16.00, mcScore: 11.34, gramScore: 10.75, totalScore: 71.52 },
  // ── Sandhya N R ──
  "saneeth t s":                     { selfAssessment: 0.000,  aiAudit: 0.000,  psScore: 11.68, lisScore: 12.60, mcScore: 10.28, gramScore: 13.75, totalScore: 48.31 },
  "akash kumar singh":               { selfAssessment: 16.000, aiAudit: 3.905,  psScore: 11.60, lisScore: 12.20, mcScore:  9.72, gramScore:  9.50, totalScore: 62.92 },
  // ── Ritesh S ──
  "nikhil v durgude":                { selfAssessment: 9.459,  aiAudit: 3.920,  psScore: 12.52, lisScore: 12.20, mcScore:  8.66, gramScore:  8.25, totalScore: 55.01 },
  "swetha a":                        { selfAssessment: 9.946,  aiAudit: 3.715,  psScore: 12.52, lisScore: 12.40, mcScore: 10.00, gramScore:  4.75, totalScore: 53.33 },
  "shruthi k b":                     { selfAssessment: 9.297,  aiAudit: 3.975,  psScore: 10.28, lisScore:  null, mcScore:  9.34, gramScore:  8.50, totalScore: 41.39 },
  "sachita g harihar":               { selfAssessment: 9.676,  aiAudit: 3.770,  psScore: 13.20, lisScore: 15.40, mcScore:  9.34, gramScore:  8.75, totalScore: 60.14 },
  "adnan sahil s":                   { selfAssessment: 9.568,  aiAudit: 4.100,  psScore: 14.00, lisScore: 17.40, mcScore:  9.34, gramScore: 14.50, totalScore: 68.91 },
  "mohammed jabeer khan":            { selfAssessment: 9.784,  aiAudit: 3.930,  psScore: 10.68, lisScore: 16.40, mcScore:  9.34, gramScore:  7.00, totalScore: 57.13 },
  "heeral sonagare":                 { selfAssessment: 7.568,  aiAudit: 3.720,  psScore: 11.42, lisScore: 14.60, mcScore: 11.34, gramScore: 11.00, totalScore: 59.65 },
  "aryaman m math":                  { selfAssessment: 7.027,  aiAudit: 3.605,  psScore: 14.26, lisScore: 16.40, mcScore: 10.00, gramScore: 13.00, totalScore: 64.29 },
  "srusti vishnukant ladda":         { selfAssessment: 9.730,  aiAudit: 3.910,  psScore: 11.88, lisScore: 17.40, mcScore:  8.80, gramScore: 14.50, totalScore: 66.22 },
  // ── Nandish S ──
  "m keshava naik":                  { selfAssessment: 9.189,  aiAudit: 3.845,  psScore: 12.52, lisScore: 13.40, mcScore:  9.14, gramScore:  6.75, totalScore: 54.84 },
  "shankar kumar":                   { selfAssessment: 8.054,  aiAudit: 3.705,  psScore:  8.92, lisScore: 14.20, mcScore:  9.14, gramScore:  7.75, totalScore: 51.77 },
  "alihussain basha hyatkhan":       { selfAssessment: 7.622,  aiAudit: 3.925,  psScore: 10.52, lisScore: 12.80, mcScore: 10.28, gramScore:  9.25, totalScore: 54.40 },
  "suma manjunath tumbraguddi":      { selfAssessment: 9.081,  aiAudit: 3.965,  psScore: 10.40, lisScore: 14.20, mcScore:  7.42, gramScore:  6.50, totalScore: 51.57 },
  "abhishek tenginkai":              { selfAssessment: 8.000,  aiAudit: 3.580,  psScore: 10.66, lisScore: 11.20, mcScore: 12.00, gramScore: 11.00, totalScore: 56.44 },
  "ambaldhage vinay kumar":          { selfAssessment: 7.351,  aiAudit: 4.080,  psScore:  9.48, lisScore: 15.20, mcScore:  9.14, gramScore: 11.00, totalScore: 56.25 },
  "lilesh bhaskar sapaliga":         { selfAssessment: 9.514,  aiAudit: 3.795,  psScore: 10.68, lisScore: 17.20, mcScore: 11.34, gramScore: 15.50, totalScore: 68.03 },
  "anand jaiswal":                   { selfAssessment: 8.432,  aiAudit: 3.765,  psScore:  8.66, lisScore: 12.20, mcScore: 12.00, gramScore:  7.75, totalScore: 52.81 },
  // ── Shalini H S ──
  "manigandan":                      { selfAssessment: 7.027,  aiAudit: 3.910,  psScore: 14.14, lisScore: 14.40, mcScore:  9.00, gramScore:  9.00, totalScore: 57.48 },
  "swati sharma":                    { selfAssessment: 8.108,  aiAudit: 3.870,  psScore: 14.80, lisScore: 17.40, mcScore:  7.50, gramScore: 11.75, totalScore: 63.43 },
  "himanshu singh rawat":            { selfAssessment: 9.081,  aiAudit: 3.865,  psScore:  9.86, lisScore: 14.20, mcScore: 11.00, gramScore:  9.25, totalScore: 57.26 },
  "aldrich frewin dsouza":           { selfAssessment: 8.649,  aiAudit: 3.800,  psScore:  null, lisScore:  null, mcScore:  null, gramScore:  null, totalScore: 12.45 },
  "surya hendry":                    { selfAssessment: 8.324,  aiAudit: 0.360,  psScore: 14.00, lisScore: 13.80, mcScore: 11.00, gramScore:  9.50, totalScore: 56.98 },
  "mohd altaf bhutta":               { selfAssessment: 7.297,  aiAudit: 3.945,  psScore: 13.34, lisScore: 13.00, mcScore: 16.80, gramScore: 13.00, totalScore: 67.38 },
  "ashish yadav":                    { selfAssessment: 7.297,  aiAudit: 3.890,  psScore: 12.67, lisScore: 15.60, mcScore: 10.50, gramScore: 10.00, totalScore: 59.96 },
  "jayanthi maniram":                { selfAssessment: 7.676,  aiAudit: 3.965,  psScore: 12.66, lisScore: 14.20, mcScore:  8.50, gramScore:  7.00, totalScore: 54.00 },
  "tulsi shankar solanki":           { selfAssessment: 8.973,  aiAudit: 3.925,  psScore: 11.20, lisScore: 16.60, mcScore: 12.00, gramScore: 10.00, totalScore: 62.70 },
  "adwait keshavraj gondkar":        { selfAssessment: 6.757,  aiAudit: 4.050,  psScore: 13.34, lisScore: 15.00, mcScore: 11.00, gramScore: 15.50, totalScore: 65.65 },
  "javed umar masute":               { selfAssessment: 7.622,  aiAudit: 4.060,  psScore:  9.60, lisScore: 12.20, mcScore: 10.00, gramScore:  6.25, totalScore: 49.73 },
  // ── Sandhya N R (additional agents) ──
  "aditya anil korde":               { selfAssessment: 15.800, aiAudit: 3.805,  psScore: 13.44, lisScore: 13.80, mcScore: 10.50, gramScore:  9.50, totalScore: 66.84 },
  "shahrukh shaikh":                 { selfAssessment: 14.700, aiAudit: 3.885,  psScore: 10.67, lisScore: 12.80, mcScore:  8.00, gramScore:  8.00, totalScore: 58.05 },
  "gorak vani":                      { selfAssessment: 14.400, aiAudit: 3.710,  psScore:  null, lisScore:  null, mcScore:  null, gramScore:  null, totalScore: 18.11 },
  "rajat gupta":                     { selfAssessment: 15.400, aiAudit: 3.760,  psScore: 14.00, lisScore: 14.20, mcScore: 11.50, gramScore:  8.00, totalScore: 66.86 },
  "bhagesh paithankar":              { selfAssessment: 14.100, aiAudit: 3.690,  psScore: 12.00, lisScore: 15.00, mcScore: 12.50, gramScore:  7.25, totalScore: 64.54 },
  "bhavna deepak porwal":            { selfAssessment: 8.800,  aiAudit: 3.685,  psScore: 14.40, lisScore: 13.40, mcScore: 10.00, gramScore: 12.00, totalScore: 62.28 },
  "bana gari naresh kumar":          { selfAssessment: 15.900, aiAudit: 3.660,  psScore: 13.20, lisScore: 11.80, mcScore: 11.00, gramScore:  6.00, totalScore: 61.56 },
  "mahesh mohan prabhu":             { selfAssessment: 13.900, aiAudit: 3.940,  psScore: 11.60, lisScore: 16.00, mcScore: 10.54, gramScore: 16.00, totalScore: 71.98 },
  // ── Shashin Birha ──
  "haritha k":                       { selfAssessment: 9.081,  aiAudit: 4.100,  psScore: 14.34, lisScore: 14.60, mcScore: 10.66, gramScore:  7.75, totalScore: 60.53 },
  "umang jain":                      { selfAssessment: 8.973,  aiAudit: 3.920,  psScore: 14.00, lisScore: 15.80, mcScore: 10.66, gramScore: 12.50, totalScore: 65.85 },
  "rahul ranjan roy":                { selfAssessment: 8.270,  aiAudit: 3.970,  psScore: 14.00, lisScore: 15.80, mcScore:  8.80, gramScore: 10.00, totalScore: 60.84 },
  "vansh arora":                     { selfAssessment: 8.486,  aiAudit: 3.895,  psScore: 12.66, lisScore: 14.60, mcScore:  8.66, gramScore:  9.00, totalScore: 57.30 },
  "deepika s":                       { selfAssessment: 9.027,  aiAudit: 3.825,  psScore: 14.40, lisScore: 16.40, mcScore: 12.50, gramScore:  9.50, totalScore: 65.65 },
  "muthu anusuya p":                 { selfAssessment: 7.730,  aiAudit: 3.660,  psScore: 10.66, lisScore: 15.00, mcScore:  8.00, gramScore: 12.50, totalScore: 57.55 },
  "aman sharma":                     { selfAssessment: 8.162,  aiAudit: 3.585,  psScore: 12.54, lisScore: 12.40, mcScore:  8.50, gramScore: 12.00, totalScore: 57.19 },
  "vickey sharma":                   { selfAssessment: 8.541,  aiAudit: 4.030,  psScore: 11.66, lisScore: 16.40, mcScore:  8.00, gramScore: 10.75, totalScore: 59.38 },
  "sahib singh":                     { selfAssessment: 8.973,  aiAudit: 3.860,  psScore: 10.34, lisScore: 12.80, mcScore:  9.34, gramScore:  6.25, totalScore: 51.56 },
  "m sunny":                         { selfAssessment: 8.486,  aiAudit: 3.890,  psScore: 10.66, lisScore: 14.40, mcScore:  8.00, gramScore:  8.75, totalScore: 54.19 },
  "nishikant tiwari":                { selfAssessment: 8.432,  aiAudit: 3.855,  psScore: 12.66, lisScore: 14.60, mcScore:  8.66, gramScore: 10.75, totalScore: 58.96 },
  "chetan patil":                    { selfAssessment: 8.703,  aiAudit: 3.980,  psScore: 14.00, lisScore: 16.80, mcScore: 10.00, gramScore: 10.25, totalScore: 63.73 },
  // ── Priyanka Sahani ──
  "priyanshu gupta":                 { selfAssessment: 8.649,  aiAudit: 4.020,  psScore:  null, lisScore:  null, mcScore:  null, gramScore:  null, totalScore: 12.67 },
  "vinayak kini":                    { selfAssessment: 9.568,  aiAudit: 3.930,  psScore: 10.40, lisScore: 18.00, mcScore:  8.00, gramScore:  7.75, totalScore: 57.65 },
  "benjamin anand mitra":            { selfAssessment: 6.216,  aiAudit: 3.980,  psScore: 12.93, lisScore: 17.20, mcScore: 11.00, gramScore: 14.75, totalScore: 66.08 },
  "namreen i bombaywale":            { selfAssessment: 7.676,  aiAudit: 3.820,  psScore:  null, lisScore:  null, mcScore:  null, gramScore:  null, totalScore: 11.50 },
  "deva sahaya rubia":               { selfAssessment: 8.595,  aiAudit: 4.080,  psScore: 15.60, lisScore: 18.40, mcScore: 10.50, gramScore: 15.25, totalScore: 72.42 },
  "geetha bhandari":                 { selfAssessment: 9.243,  aiAudit: 3.900,  psScore: 10.67, lisScore: 15.20, mcScore:  6.00, gramScore:  6.00, totalScore: 51.01 },
  "shaheen ismail dhaliet":          { selfAssessment: 8.919,  aiAudit: 3.910,  psScore: 12.27, lisScore: 17.20, mcScore:  9.50, gramScore:  7.25, totalScore: 59.05 },
  "sourav basotia":                  { selfAssessment: 8.595,  aiAudit: 3.775,  psScore:  null, lisScore:  null, mcScore:  null, gramScore:  null, totalScore: 12.37 },
  "pratik poddar":                   { selfAssessment: 8.541,  aiAudit: 3.820,  psScore:  null, lisScore:  null, mcScore:  null, gramScore:  null, totalScore: 12.36 },
  "ashok sunar":                     { selfAssessment: 8.432,  aiAudit: 3.960,  psScore: 11.34, lisScore: 17.60, mcScore: 11.50, gramScore:  9.25, totalScore: 62.08 },
  "anjali gupta":                    { selfAssessment: 8.432,  aiAudit: 3.735,  psScore:  null, lisScore:  null, mcScore:  null, gramScore:  null, totalScore: 12.17 },
  // ── Roopashri S ──
  "ashish thakur":                   { selfAssessment: 8.595,  aiAudit: 3.910,  psScore: 11.20, lisScore: 14.00, mcScore:  9.50, gramScore: 12.00, totalScore: 59.20 },
  "sougata das":                     { selfAssessment: 7.027,  aiAudit: 3.900,  psScore: 11.46, lisScore: 19.20, mcScore: 10.00, gramScore: 14.75, totalScore: 66.34 },
  "arun kumar m":                    { selfAssessment: 8.757,  aiAudit: 3.935,  psScore: 10.27, lisScore: 16.80, mcScore: 11.50, gramScore:  8.25, totalScore: 59.51 },
  "malay pathak":                    { selfAssessment: 8.378,  aiAudit: 4.875,  psScore: 13.74, lisScore: 16.40, mcScore: 11.00, gramScore: 14.25, totalScore: 68.64 },
  "ananth sai sharma":               { selfAssessment: 8.054,  aiAudit: 3.825,  psScore: 11.87, lisScore: 16.40, mcScore:  7.50, gramScore: 11.00, totalScore: 58.65 },
  "mrinal sarkar":                   { selfAssessment: 8.811,  aiAudit: 3.970,  psScore: 14.00, lisScore: 17.60, mcScore: 11.50, gramScore: 14.00, totalScore: 69.88 },
  "apurva tyagi":                    { selfAssessment: 8.973,  aiAudit: 3.290,  psScore:  null, lisScore:  null, mcScore:  null, gramScore:  null, totalScore: 12.26 },
  "anirudh":                         { selfAssessment: 0.000,  aiAudit: 0.000,  psScore: 12.00, lisScore: 15.20, mcScore: 11.00, gramScore: 19.25, totalScore: 57.45 },
  "dev":                             { selfAssessment: 0.000,  aiAudit: 0.000,  psScore: 11.73, lisScore: 14.40, mcScore:  9.00, gramScore: 12.75, totalScore: 47.88 },
  "deepak kumar":                    { selfAssessment: 8.432,  aiAudit: 3.270,  psScore: 11.20, lisScore: 15.20, mcScore:  7.50, gramScore: 10.25, totalScore: 55.85 },
  // ── New agents added in v37 ──
  // ── Ankit Singh ──
  "bhagyashree":                     { selfAssessment: 9.243243, aiAudit: 3.88,  psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 13.12 },
  "bhanuprakash":                    { selfAssessment: 8.0,      aiAudit: 3.825, psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 11.82 },
  "jatin sharma":                    { selfAssessment: 7.297297, aiAudit: 3.89,  psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 11.19 },
  "koushik c":                       { selfAssessment: 7.189189, aiAudit: 4.125, psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: null },
  "md tahur":                        { selfAssessment: 7.351351, aiAudit: 3.93,  psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 11.28 },
  "megham sai srinivas":             { selfAssessment: 7.351351, aiAudit: 3.97,  psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 11.32 },
  "mohan bhumayya sabban":           { selfAssessment: 8.0,      aiAudit: 3.795, psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 11.79 },
  "naheet parwin":                   { selfAssessment: 8.0,      aiAudit: 3.815, psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 11.81 },
  "pawan rajesh bohra":              { selfAssessment: 7.513514, aiAudit: 3.19,  psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 10.70 },
  "priyanka singh":                  { selfAssessment: 6.756757, aiAudit: 3.875, psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 10.63 },
  "ranjitha k":                      { selfAssessment: 7.135135, aiAudit: 3.915, psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 11.05 },
  "sakshi suryakant pawar":          { selfAssessment: 7.675676, aiAudit: 3.96,  psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 11.64 },
  "shekhar suman":                   { selfAssessment: 7.351351, aiAudit: 4.0,   psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 11.35 },
  "vaishali b":                      { selfAssessment: 7.405405, aiAudit: 3.685, psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 11.09 },
  "vipul devendra manek":            { selfAssessment: 8.216216, aiAudit: 3.96,  psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 12.18 },
  // ── Anoop Bharat Japtap ──
  "abdulsamad riyazahmed jamadar":   { selfAssessment: 9.135135, aiAudit: 3.685, psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 12.82 },
  "adnan parvezahmed darga":         { selfAssessment: 9.675676, aiAudit: 3.94,  psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 13.62 },
  "amardeep narayan baswa":          { selfAssessment: 8.01,     aiAudit: 4.005, psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 12.02 },
  "amit mahantesh baligar":          { selfAssessment: 8.756757, aiAudit: 3.955, psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 12.71 },
  "ankush ajay chougule":            { selfAssessment: 9.405405, aiAudit: 3.98,  psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 13.39 },
  "ashwinkumar a shet":              { selfAssessment: 7.189189, aiAudit: 3.925, psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 11.11 },
  "nayan hosur":                     { selfAssessment: 9.621622, aiAudit: 3.895, psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 13.52 },
  "prajwal":                         { selfAssessment: 9.675676, aiAudit: 3.67,  psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 13.35 },
  "rajashekharayya salimath":        { selfAssessment: 7.189189, aiAudit: 3.845, psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 11.03 },
  "rakesh guddadmani":               { selfAssessment: 8.756757, aiAudit: 3.91,  psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 12.67 },
  "rohan ajit kokane":               { selfAssessment: 8.0,      aiAudit: 3.98,  psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 11.98 },
  "sujay sanjeev satpute":           { selfAssessment: 6.810811, aiAudit: 3.875, psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 10.69 },
  "vikas koti":                      { selfAssessment: 8.0,      aiAudit: 3.58,  psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 11.58 },
  // ── Basavaraj Gurav ──
  "harshvardhan singh rathore":      { selfAssessment: 7.837838, aiAudit: 4.015, psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 11.85 },
  "pratik p bontra":                 { selfAssessment: 8.0,      aiAudit: 3.82,  psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 11.82 },
  "rajan kiran wagh":                { selfAssessment: 8.0,      aiAudit: 3.86,  psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 11.86 },
  "shrikanth k":                     { selfAssessment: 8.0,      aiAudit: 3.85,  psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 11.85 },
  "srawani deka basumatary":         { selfAssessment: 8.162162, aiAudit: 4.0,   psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 12.16 },
  "vipul prakash sande":             { selfAssessment: 7.837838, aiAudit: 3.97,  psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 11.81 },
  "vishvajeet singh":                { selfAssessment: 8.0,      aiAudit: 3.77,  psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 11.77 },
  // ── Gopi Kiran ──
  "ankit agarwal":                   { selfAssessment: 8.702703, aiAudit: 3.82,  psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 12.52 },
  "mary salins":                     { selfAssessment: 9.72973,  aiAudit: 3.985, psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 13.71 },
  "masooma yousuf":                  { selfAssessment: 8.486486, aiAudit: 3.525, psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 12.01 },
  "murgendra rajashekhar patil":     { selfAssessment: 8.864865, aiAudit: 3.77,  psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 12.63 },
  "nitin tanajirao pimpalpalle":     { selfAssessment: 8.972973, aiAudit: 4.03,  psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 13.0 },
  "s mohammed akhil":                { selfAssessment: 9.621622, aiAudit: 3.865, psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 13.49 },
  // ── Harish V ──
  "ankit raj":                       { selfAssessment: 9.837838, aiAudit: 3.855, psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 13.69 },
  // ── Harsha Kumar ──
  "akilkumar":                       { selfAssessment: 6.108108, aiAudit: 3.885, psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: null },
  "amrita meher":                    { selfAssessment: 7.027027, aiAudit: 3.81,  psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 10.84 },
  "charitha n":                      { selfAssessment: 8.432432, aiAudit: 4.07,  psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 12.50 },
  "mahesh h":                        { selfAssessment: 8.756757, aiAudit: 3.89,  psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 12.65 },
  "nikhil raveendran":               { selfAssessment: 6.162162, aiAudit: 3.85,  psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 10.01 },
  "praveen kumar j h":               { selfAssessment: 6.702703, aiAudit: 3.885, psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 10.59 },
  "raghu r":                         { selfAssessment: 8.216216, aiAudit: 3.92,  psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 12.14 },
  "rashmi sachin desai":             { selfAssessment: 7.297297, aiAudit: 3.965, psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 11.26 },
  "renuka devi c":                   { selfAssessment: 7.783784, aiAudit: 3.75,  psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 11.53 },
  "subhashree das":                  { selfAssessment: 8.0,      aiAudit: 3.925, psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 11.93 },
  "tapasi gayen":                    { selfAssessment: 7.135135, aiAudit: 3.93,  psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 11.07 },
  "vikram r":                        { selfAssessment: 8.972973, aiAudit: 3.845, psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 12.82 },
  // ── Leepha Joseph ──
  "abhimanyu":                       { selfAssessment: 6.0,      aiAudit: 3.825, psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 9.82 },
  "amritpal singh":                  { selfAssessment: 9.675676, aiAudit: 3.915, psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 13.59 },
  "arpitha l k":                     { selfAssessment: 5.837838, aiAudit: 3.825, psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 9.66 },
  "chittimani bhaviteja":            { selfAssessment: 7.189189, aiAudit: 3.975, psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 11.16 },
  "deepak b nair":                   { selfAssessment: 6.108108, aiAudit: 3.885, psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 9.99 },
  "joel k joy":                      { selfAssessment: 9.351351, aiAudit: 4.0,   psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 13.35 },
  "m nikhil":                        { selfAssessment: 7.567568, aiAudit: 3.895, psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 11.46 },
  "rakesh s sankangoudar":           { selfAssessment: 7.837838, aiAudit: 4.025, psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 11.86 },
  "rugved sambhajirao yadav":        { selfAssessment: 8.0,      aiAudit: 3.895, psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 11.89 },
  "shruti jain":                     { selfAssessment: 7.189189, aiAudit: 4.125, psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 11.31 },
  // ── Munish Kumar ──
  "anubhav nepal":                   { selfAssessment: 7.837838, aiAudit: 4.025, psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: null },
  "ashish jyoti bora":               { selfAssessment: 9.351351, aiAudit: 4.0,   psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: null },
  "aswin prasad":                    { selfAssessment: 8.756757, aiAudit: 3.84,  psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 12.60 },
  "dipanwita saha":                  { selfAssessment: 8.432432, aiAudit: 3.95,  psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 12.38 },
  "ganesh t":                        { selfAssessment: 8.486486, aiAudit: 3.58,  psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 12.07 },
  "neeti toppo":                     { selfAssessment: 8.0,      aiAudit: 3.875, psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 11.88 },
  "nitesh kumar":                    { selfAssessment: 9.567568, aiAudit: 3.9,   psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 13.47 },
  "riya goyal":                      { selfAssessment: 8.486486, aiAudit: 3.775, psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 12.26 },
  "sanjay s":                        { selfAssessment: 8.0,      aiAudit: 3.895, psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: null },
  "sayantan bhattacharyya":          { selfAssessment: 8.324324, aiAudit: 3.96,  psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 12.28 },
  "simran gabrial masih":            { selfAssessment: 8.324324, aiAudit: 4.035, psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 12.36 },
  "suman adithya rao":               { selfAssessment: 8.0,      aiAudit: 4.025, psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 12.03 },
  "sweta soni":                      { selfAssessment: 7.783784, aiAudit: 3.89,  psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 11.67 },
  "venkatesh barad":                 { selfAssessment: 7.513514, aiAudit: 3.86,  psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 11.37 },
  "vipul jain":                      { selfAssessment: 8.0,      aiAudit: 3.815, psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 11.81 },
  // ── Nandish S ──
  "kamalpreet kour":                 { selfAssessment: 0.0,      aiAudit: 0.0,   psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 0.0 },
  "suresh kumar sahoo":              { selfAssessment: 9.621622, aiAudit: 3.905, psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 13.53 },
  // ── Nikita Sachin Desai ──
  "amulya k":                        { selfAssessment: 6.486486, aiAudit: 3.81,  psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 10.30 },
  "anup sadanandan":                 { selfAssessment: 7.189189, aiAudit: 3.96,  psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 11.15 },
  "jay prakash singh":               { selfAssessment: 7.783784, aiAudit: 4.01,  psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 11.79 },
  "maya m pillai":                   { selfAssessment: 6.594595, aiAudit: 3.39,  psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 9.98 },
  "mehul harihar dhande":            { selfAssessment: 0.0,      aiAudit: 0.0,   psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 0.0 },
  "prathvik saldanha":               { selfAssessment: 7.351351, aiAudit: 3.945, psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 11.30 },
  "ravikumar mangilal shah":         { selfAssessment: 7.513514, aiAudit: 3.895, psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 11.41 },
  "rohan jain":                      { selfAssessment: 6.594595, aiAudit: 3.655, psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 10.25 },
  "sumanth kumar sahu":              { selfAssessment: 9.081081, aiAudit: 3.89,  psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 12.97 },
  "tabassum sharieff":               { selfAssessment: 7.189189, aiAudit: 3.975, psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: null },
  "vivek kumar verma":               { selfAssessment: 4.702703, aiAudit: 3.86,  psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 8.56 },
  // ── Pradeep Kumar V ──
  "amit khatri":                     { selfAssessment: 7.027027, aiAudit: 3.955, psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 10.98 },
  "anchal ratan isaac":              { selfAssessment: 7.189189, aiAudit: 4.085, psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: null },
  "anil kumara m":                   { selfAssessment: 7.351351, aiAudit: 3.995, psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 11.35 },
  "ankita bharat kabra":             { selfAssessment: 7.675676, aiAudit: 3.86,  psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 11.54 },
  "chandru b":                       { selfAssessment: 9.675676, aiAudit: 3.85,  psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 13.53 },
  "govind goel":                     { selfAssessment: 5.837838, aiAudit: 3.825, psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: null },
  "neha chugh":                      { selfAssessment: 7.567568, aiAudit: 3.895, psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: null },
  "premkumar shivappa kumbar":       { selfAssessment: 8.756757, aiAudit: 3.825, psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 12.58 },
  "soumya das":                      { selfAssessment: 8.054054, aiAudit: 3.975, psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 12.03 },
  "sourabh singha":                  { selfAssessment: 7.513514, aiAudit: 3.91,  psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 11.42 },
  "supriti sinha":                   { selfAssessment: 7.621622, aiAudit: 3.9,   psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 11.52 },
  "sushree sangita santi":           { selfAssessment: 9.297297, aiAudit: 3.84,  psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 13.14 },
  "yadhu raman":                     { selfAssessment: 8.216216, aiAudit: 3.87,  psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 12.09 },
  // ── Priyanka Dash ──
  "amar vishwakarma":                { selfAssessment: 7.567568, aiAudit: 3.885, psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 11.45 },
  "m vinod":                         { selfAssessment: 8.540541, aiAudit: 2.63,  psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 11.17 },
  "naman prakash awasthi":           { selfAssessment: 8.972973, aiAudit: 3.855, psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 12.83 },
  "prateek manvi":                   { selfAssessment: 9.351351, aiAudit: 3.89,  psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 13.24 },
  "regan lobo":                      { selfAssessment: 8.486486, aiAudit: 3.96,  psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 12.45 },
  "sadiya banu":                     { selfAssessment: 8.594595, aiAudit: 3.885, psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 12.48 },
  "sangeetha p":                     { selfAssessment: 8.216216, aiAudit: 3.9,   psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 12.12 },
  "sarfaraj najeer kudachee":        { selfAssessment: 7.297297, aiAudit: 3.785, psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 11.08 },
  "shaktiprasad bentur":             { selfAssessment: 8.27027,  aiAudit: 4.105, psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 12.38 },
  "shashidhara l":                   { selfAssessment: 7.513514, aiAudit: 4.0,   psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: null },
  "shivanjali kumari":               { selfAssessment: 9.72973,  aiAudit: 3.965, psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 13.69 },
  "vivek g k":                       { selfAssessment: 8.540541, aiAudit: 3.955, psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 12.50 },
  // ── Ratanjeet Maharaj ──
  "fiza kouser":                     { selfAssessment: 7.891892, aiAudit: 3.67,  psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 11.56 },
  "khushpreet kaur":                 { selfAssessment: 9.675676, aiAudit: 3.85,  psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 13.53 },
  "martin davis":                    { selfAssessment: 6.756757, aiAudit: 3.8,   psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 10.56 },
  "priyank sharma":                  { selfAssessment: 8.648649, aiAudit: 4.025, psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 12.67 },
  "roshan km":                       { selfAssessment: 7.513514, aiAudit: 3.52,  psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 11.03 },
  "shashank verma":                  { selfAssessment: 7.027027, aiAudit: 3.675, psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 10.70 },
  "shrutika sumit jain":             { selfAssessment: 8.378378, aiAudit: 3.85,  psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 12.23 },
  "tejas k madeval":                 { selfAssessment: 7.945946, aiAudit: 3.67,  psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 11.62 },
  // ── Renuka Mishra ──
  "adarsh singh gautam":             { selfAssessment: 7.945946, aiAudit: 4.05,  psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 12.0 },
  "ankita das":                      { selfAssessment: 9.135135, aiAudit: 3.96,  psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 13.10 },
  "girish a":                        { selfAssessment: 8.27027,  aiAudit: 3.825, psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 12.10 },
  "gonegondla karanam venkata karthik": { selfAssessment: 8.216216, aiAudit: 3.725, psScore: 12.80, lisScore: 17.80, mcScore: 18.00, gramScore: 13.50, totalScore: 74.04 },
  "keyur p shah":                    { selfAssessment: 8.594595, aiAudit: 3.67,  psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 12.26 },
  "m kiran":                         { selfAssessment: 5.72973,  aiAudit: 3.725, psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 9.45 },
  "saqlain khalique shaikh":         { selfAssessment: 8.108108, aiAudit: 3.85,  psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 11.96 },
  // ── Ritesh S ──
  "maddu vidya":                     { selfAssessment: 6.864865, aiAudit: 3.89,  psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 10.75 },
  // ── Roopashri S ──
  "anirudh m gokhale":               { selfAssessment: 0.0,      aiAudit: 0.0,   psScore: 12.0, lisScore: 15.2, mcScore: 11.0, gramScore: 19.25, totalScore: 57.45 },
  "renuka p d":                      { selfAssessment: null,     aiAudit: null,  psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: null },
  "vachhiyat dev":                   { selfAssessment: null,     aiAudit: null,  psScore: 11.73, lisScore: 14.4, mcScore: 9.0, gramScore: 12.75, totalScore: 47.88 },
  // ── Sadique Raza ──
  "amit sharma rajeshwar":           { selfAssessment: 7.405405, aiAudit: 3.955, psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 11.36 },
  "chitra mulchand raghani":         { selfAssessment: 9.405405, aiAudit: 3.885, psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 13.29 },
  "irfan mustafa shaikh":            { selfAssessment: 9.675676, aiAudit: 3.91,  psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 13.59 },
  "naved abdul latif qureshi":       { selfAssessment: 8.702703, aiAudit: 3.89,  psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 12.59 },
  "pragya agrawal":                  { selfAssessment: 9.243243, aiAudit: 3.765, psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 13.01 },
  "priya singh":                     { selfAssessment: 9.567568, aiAudit: 3.865, psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 13.43 },
  "rashid firoz ahmed ansari":       { selfAssessment: 7.513514, aiAudit: 3.55,  psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 11.06 },
  "salman batliwala":                { selfAssessment: 6.810811, aiAudit: 3.89,  psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 10.70 },
  "shweta anil tiwari":              { selfAssessment: 6.108108, aiAudit: 3.66,  psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 9.77 },
  "vishal shivsahay singh":          { selfAssessment: 8.27027,  aiAudit: 4.005, psScore: null, lisScore: null, mcScore: null, gramScore: 9.8125, totalScore: 22.09 },
  // ── Shalini H S ──
  "aimen nasardi":                   { selfAssessment: 8.216216, aiAudit: 3.515, psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 11.73 },
  // ── Sharuq Fayaz Shaikh ──
  "anupam premanand vernekar":       { selfAssessment: 8.648649, aiAudit: 4.015, psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 12.66 },
  "faisal javed shaikh":             { selfAssessment: 8.864865, aiAudit: 3.925, psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 12.79 },
  "faizan mohammed ismail rangrez":  { selfAssessment: 8.756757, aiAudit: 3.93,  psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 12.69 },
  "nauseen asif nargund":            { selfAssessment: 8.27027,  aiAudit: 3.975, psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 12.25 },
  "nehal ravindra kallimani":        { selfAssessment: 8.648649, aiAudit: 3.96,  psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 12.61 },
  "nisha shankar kurubar":           { selfAssessment: 8.918919, aiAudit: 4.04,  psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 12.96 },
  "nitin namdev ningannavar":        { selfAssessment: 8.702703, aiAudit: 4.03,  psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 12.73 },
  "rakesh naik":                     { selfAssessment: 9.027027, aiAudit: 3.915, psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 12.94 },
  "rohit rajeshkumar patil":         { selfAssessment: 8.486486, aiAudit: 3.915, psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 12.40 },
  "shabaaz babajan shaikh":          { selfAssessment: 8.918919, aiAudit: 3.93,  psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 12.85 },
  "shubham oza":                     { selfAssessment: 8.486486, aiAudit: 3.965, psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 12.45 },
  "vaibhavi vinod balse":            { selfAssessment: 8.162162, aiAudit: 4.01,  psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 12.17 },
  "vishal vijay chavan":             { selfAssessment: 7.459459, aiAudit: 4.005, psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 11.46 },
  "yalleshi mareppa holennavar":     { selfAssessment: 0.0,      aiAudit: 0.0,   psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 0.0 },
  // ── Shweta ──
  "ajmal rahim":                     { selfAssessment: 5.945946, aiAudit: 3.995, psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 9.94 },
  "akhil m a":                       { selfAssessment: 8.216216, aiAudit: 3.92,  psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 12.14 },
  "irfan pasha s":                   { selfAssessment: 6.0,      aiAudit: 3.825, psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 9.82 },
  "ishan dhadwal":                   { selfAssessment: 6.594595, aiAudit: 3.72,  psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 10.31 },
  "jaideep singh":                   { selfAssessment: 7.675676, aiAudit: 4.0,   psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 11.68 },
  "jyoti umesh sulgekar":            { selfAssessment: 7.135135, aiAudit: 4.0,   psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 11.14 },
  "k prakash rao":                   { selfAssessment: 7.135135, aiAudit: 3.965, psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 11.10 },
  "kumar m g":                       { selfAssessment: 7.513514, aiAudit: 3.625, psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 11.14 },
  "neethu paulose":                  { selfAssessment: 8.756757, aiAudit: 3.95,  psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 12.71 },
  "ravishankar mohan cherukupalli":  { selfAssessment: 9.513514, aiAudit: 3.945, psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 13.46 },
  "sharique shahid ansari":          { selfAssessment: 7.945946, aiAudit: 3.89,  psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 11.84 },
  "shridhar":                        { selfAssessment: 9.513514, aiAudit: 4.03,  psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 13.54 },
  "shweta chauhan":                  { selfAssessment: 9.081081, aiAudit: 3.78,  psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 12.86 },
  // ── Shwethayini ──
  "chandan kumar":                   { selfAssessment: 0.0,      aiAudit: 0.0,   psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 0.0 },
  "mutyala dinesh":                  { selfAssessment: 9.081081, aiAudit: 3.605, psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 12.69 },
  "nikhil murlidhar bhatkar":        { selfAssessment: 8.162162, aiAudit: 3.725, psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 11.89 },
  "rahul kumar":                     { selfAssessment: 7.459459, aiAudit: 3.85,  psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 11.31 },
  "ravi kumar deo":                  { selfAssessment: 6.972973, aiAudit: 3.66,  psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 10.63 },
  "rohini kumari":                   { selfAssessment: 7.783784, aiAudit: 3.67,  psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 11.45 },
  "sridevi k v":                     { selfAssessment: 7.513514, aiAudit: 3.82,  psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 11.33 },
  "suman janghel":                   { selfAssessment: 7.405405, aiAudit: 3.725, psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 11.13 },
  "vishal bhattar":                  { selfAssessment: 8.108108, aiAudit: 3.62,  psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 11.73 },
  // ── Swanand Dixit ──
  "alamgir haque":                   { selfAssessment: 6.648649, aiAudit: 3.715, psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 10.36 },
  "bharat halagalimath":             { selfAssessment: 7.72973,  aiAudit: 3.765, psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 11.49 },
  "deepanshi lalwani":               { selfAssessment: 8.972973, aiAudit: 3.895, psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 12.87 },
  "karthik r":                       { selfAssessment: 7.837838, aiAudit: 3.67,  psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 11.51 },
  "mayank lodha":                    { selfAssessment: 6.432432, aiAudit: 3.825, psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 10.26 },
  "roshni":                          { selfAssessment: 7.675676, aiAudit: 3.925, psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 11.60 },
  "sachinkumar ghanti b":            { selfAssessment: 9.459459, aiAudit: 3.885, psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 13.34 },
  // ── Vignesh Baliga ──
  "ankit":                           { selfAssessment: 7.459459, aiAudit: 3.855, psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 11.31 },
  "diksha u rane":                   { selfAssessment: 6.432432, aiAudit: 3.8,   psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 10.23 },
  "himanshu narula":                 { selfAssessment: 7.189189, aiAudit: 3.865, psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 11.05 },
  "shivanagoud huvanagoud ninganagoudar": { selfAssessment: 7.72973, aiAudit: 3.92, psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 11.65 },
  // ── Viraj Raikar ──
  "aaqib beerwala":                  { selfAssessment: 8.594595, aiAudit: 3.85,  psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 12.44 },
  "amit goudadi":                    { selfAssessment: 8.594595, aiAudit: 4.0,   psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 12.59 },
  "anuj ajay chougule":              { selfAssessment: 8.594595, aiAudit: 3.645, psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 12.24 },
  "gautam shah":                     { selfAssessment: 7.783784, aiAudit: 3.945, psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 11.73 },
  "mohammed younus c a":             { selfAssessment: 8.594595, aiAudit: 3.765, psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 12.36 },
  "nagaratna mahantesh marihal":     { selfAssessment: 8.27027,  aiAudit: 3.915, psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 12.19 },
  "nagesh pednekar":                 { selfAssessment: 7.567568, aiAudit: 3.86,  psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 11.43 },
  "nikhil subhash chavan":           { selfAssessment: 8.108108, aiAudit: 3.965, psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 12.07 },
  "pravin gajanan ternikar":         { selfAssessment: 7.081081, aiAudit: 3.915, psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 11.0 },
  "saivishal vinod balse":           { selfAssessment: 7.513514, aiAudit: 4.03,  psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 11.54 },
  "sneahaal mulaawadmath":           { selfAssessment: 9.459459, aiAudit: 3.965, psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 13.42 },
  "suraj praveen motimath":          { selfAssessment: 9.027027, aiAudit: 3.79,  psScore: null, lisScore: null, mcScore: null, gramScore: null, totalScore: 12.82 },
  "juned peerjade":                  { selfAssessment: 8.972973, aiAudit: 3.655, psScore: null, lisScore: null, mcScore: null, gramScore: 10.75, totalScore: 23.38 },
  "wagesh gopal jadhav":             { selfAssessment: 8.486486, aiAudit: 3.740, psScore: null, lisScore: null, mcScore: null, gramScore: 10.75, totalScore: 22.98 },
  "shubham sambhaji bhadvankar":     { selfAssessment: 8.486486, aiAudit: 3.965, psScore: null, lisScore: null, mcScore: null, gramScore: 10.75, totalScore: 23.20 }
};

// Maps the name as stored in the DB (trainee.name) → canonical name used in _MANAGER_AGENT_MAP.
// Keys are lowercase. Value is the correct canonical name (mixed-case, matching the map).
const _TRAINEE_ALIASES = {
  // Trainee duplicate variants mapping to canonical Excel names
  "bhanuprakasha lr":           "Bhanuprakash",
  "vipul manek":                "Vipul Devendra Manek",
  "sakshi pawar":               "Sakshi Suryakant Pawar",
  "ravikumar shah":             "Ravikumar Mangilal Shah",
  "mohan":                      "Mohan Bhumayya Sabban",
  "vaishali.b":                 "Vaishali B",
  "priya singh":                "Priyanka Singh",

  "alihussain basha hayatkhan": "Alihussain Basha Hyatkhan", // HAYAT → HYAT
  "shankar kumar jha":          "Shankar Kumar",             // extra surname
  "lovepreet singh":            "Love Preet Singh",          // no space
  "heeral sonegare":            "Heeral Sonagare",           // Sonegare → Sonagare
  "swetha":                     "Swetha A",                  // missing surname initial
  "nikhil vijay durgude":       "Nikhil V Durgude",         // full middle name vs initial
  "naveenkumar":                "Naveenkumar Ayyangoudar",  // missing surname
  "akash":                      "Akash Kumar Singh",         // first name only
  "kg saroj":                   "K G Saroj",                 // no space in initials
  "suma manjunath":             "Suma Manjunath Tumbraguddi", // missing surname
  "saneeth":                    "Saneeth T S",               // missing initials
  // v37 aliases
  "anirudh":                    "Anirudh M Gokhale",         // old "Anirudh" → full name
  "dev":                        "Vachhiyat Dev",             // old "Dev" → full name
  "gajanan ternikar":           "Pravin Gajanan Ternikar",  // name corrected in new sheet
  "roshan k m":                 "Roshan KM",                 // spacing variant
  "leepha joseph":              "Leepha Joseph",             // normalise casing
  // Leepha Joseph team
  "maddu nikhil":               "M Nikhil",                  // full first name — M = Maddu
  "bhaviteja chittimani":       "Chittimani Bhaviteja",      // first/last name reversed
  // Sadique Raza team — short names registered vs. full names in master sheet
  "amit sharma":                "Amit Sharma Rajeshwar",     // missing surname
  "chitra raghani":             "Chitra Mulchand Raghani",  // missing middle name
  "salman":                     "Salman Batliwala",          // first name only
  "salman batiwala":            "Salman Batliwala",          // typo variant (one 'l')
  "shweta tiwari":              "Shweta Anil Tiwari",        // missing middle name
  "naved quresh":               "Naved Abdul Latif Qureshi", // truncated surname
  "naved qureshi":              "Naved Abdul Latif Qureshi", // common spelling variant

  // ── Viraj Raikar team ──
  "sai vishal balse":           "Saivishal Vinod Balse",     // space in compound first name + missing middle
  "sai vishal vinod balse":     "Saivishal Vinod Balse",     // space variant with middle name
  "saivishal balse":            "Saivishal Vinod Balse",     // missing middle name
  "snehal mulaawadmath":        "Sneahaal Mulaawadmath",     // simplified spelling
  "snehaal mulaawadmath":       "Sneahaal Mulaawadmath",     // one 'a' variant
  "sneahall":                   "Sneahaal Mulaawadmath",     // double-l misspelling (first name only)
  "sneahall mulaawadmath":      "Sneahaal Mulaawadmath",     // double-l misspelling with surname
  "sneahaal":                   "Sneahaal Mulaawadmath",     // first name only (no surname)
  "aqib beerwala":              "Aaqib Beerwala",            // missing leading 'a'
  "aaqib berwala":              "Aaqib Beerwala",            // missing 'e'
  "anuj chougule":              "Anuj Ajay Chougule",        // missing middle name
  "nikhil chavan":              "Nikhil Subhash Chavan",     // missing middle name
  "suraj motimath":             "Suraj Praveen Motimath",    // missing middle name
  "nagaratna marihal":          "Nagaratna Mahantesh Marihal", // missing middle name
  "amit goudadi":               "Amit Goudadi",              // exact (ensure no casing issue)
  "pravin ternikar":            "Pravin Gajanan Ternikar",   // missing middle name
  "mohammed yonus":             "Mohammed Younus C A",       // truncated / spelling variant
  "mohammed yonus c a":        "Mohammed Younus C A",       // spelling variant with initials
  "mohammed younus":            "Mohammed Younus C A",       // correct spelling, missing initials

  // ── Anoop Bharat Japtap team ──
  "abdulsamad jamadar":         "Abdulsamad Riyazahmed Jamadar",   // missing middle name
  "abdul samad jamadar":        "Abdulsamad Riyazahmed Jamadar",   // space in first name
  "adnan darga":                "Adnan Parvezahmed Darga",         // missing middle name
  "ashwin shet":                "Ashwinkumar A Shet",              // shortened first name
  "ashwinkumar shet":           "Ashwinkumar A Shet",              // missing initial
  "amit baligar":               "Amit Mahantesh Baligar",          // missing middle name
  "ankush chougule":            "Ankush Ajay Chougule",            // missing middle name
  "sujay satpute":              "Sujay Sanjeev Satpute",           // missing middle name
  "amardeep baswa":             "Amardeep Narayan Baswa",          // missing middle name
  "rohan kokane":               "Rohan Ajit Kokane",               // missing middle name
  "rakesh guddadmani":          "Rakesh Guddadmani",               // exact (normalise)
  "rajashekharayya salimath":   "Rajashekharayya Salimath",        // exact (normalise)

  // ── Sharuq Fayaz Shaikh team ──
  "vaibhavi balse":             "Vaibhavi Vinod Balse",       // missing middle name
  "vaibhavi vinod balse":       "Vaibhavi Vinod Balse",       // exact (normalise)
  "shabaz shaikh":              "Shabaaz Babajan Shaikh",     // simplified spelling + missing middle
  "shabaaz shaikh":             "Shabaaz Babajan Shaikh",     // missing middle name
  "faisal shaikh":              "Faisal Javed Shaikh",        // missing middle name
  "nauseen nargund":            "Nauseen Asif Nargund",       // missing middle name
  "nisha kurubar":              "Nisha Shankar Kurubar",      // missing middle name
  "anupam vernekar":            "Anupam Premanand Vernekar",  // missing middle name
  "vishal chavan":              "Vishal Vijay Chavan",        // missing middle name
  "nitin ningannavar":          "Nitin Namdev Ningannavar",   // missing middle name
  "faizan rangrez":             "Faizan Mohammed Ismail Rangrez", // shortened
  "rohit patil":                "Rohit Rajeshkumar Patil",    // missing middle name
  "nehal kallimani":            "Nehal Ravindra Kallimani",   // missing middle name
  "yalleshi holennavar":        "Yalleshi Mareppa Holennavar", // missing middle name
  "shubham sambhaji bhadavankar": "Shubham Sambhaji Bhadvankar", // extra 'a' in surname

  // ── Girish A team ──
  "dnyanesh jitendra badgujar": "Dnyanesh JItendra Badgujar",
  "s dhruvanandana":            "Dhruvanandana",
  "v r dhan raj":               "Dhanraj",
  "v r dhanraj":                "Dhanraj",
  "mehul chandrakant shetty":   "Mehul Chandtrakant Shetty",

  // ── Additional team aliases ──
  "sanjay suresh":              "Sanjay S",
  "ganesh thiagarajan":         "Ganesh T",
  "rugved yadav":               "Rugved Sambhajirao Yadav"
};

// Resolve a raw DB/session name to its canonical map name (if an alias exists).
function _resolveAlias(name) {
  if (!name) return name;
  return _TRAINEE_ALIASES[name.trim().toLowerCase()] || name;
}

// Look up master scores by trainee name (case-insensitive; resolves aliases automatically).
// Strategy 1: exact lowercase key
// Strategy 2: compact (remove spaces)
// Strategy 3: full alnum (strip non-alphanumeric)
// Strategy 4: first+last token match — handles middle-name variants and split compound
//             first names (e.g. "Sai Vishal Balse" ↔ "Saivishal Vinod Balse")
function getMasterScores(name) {
  if (window.Admin && window.Admin.isComm360Deleted && window.Admin.isComm360Deleted()) {
    return null;
  }
  if (!name) return null;
  const resolved = _resolveAlias(name);
  const key = resolved.trim().toLowerCase();
  const alnum = s => s.replace(/[^a-z0-9]/g, '');

  if (MASTER_SCORES[key]) return MASTER_SCORES[key];

  const compact = key.replace(/\s+/g, '');
  const hit2 = Object.entries(MASTER_SCORES).find(([k]) => k.replace(/\s+/g, '') === compact)?.[1];
  if (hit2) return hit2;

  const normKey = alnum(key);
  if (!normKey) return null;
  const hit3 = Object.entries(MASTER_SCORES).find(([k]) => alnum(k) === normKey)?.[1];
  if (hit3) return hit3;

  // Strategy 4: first-token prefix + exact last-token match
  // Catches "Sai Vishal Balse" → "Saivishal Vinod Balse",
  //         "Ashwin Shet"      → "Ashwinkumar A Shet",
  //         "Vaibhavi Balse"   → "Vaibhavi Vinod Balse", etc.
  const inputToks = key.split(/\s+/).filter(Boolean);
  if (inputToks.length >= 2) {
    const firstIn = alnum(inputToks[0]);
    const lastIn  = alnum(inputToks[inputToks.length - 1]);
    if (firstIn && lastIn) {
      const hit4 = Object.entries(MASTER_SCORES).find(([k]) => {
        const kToks = k.split(/\s+/).filter(Boolean);
        if (kToks.length < 2) return false;
        const firstK = alnum(kToks[0]);
        const lastK  = alnum(kToks[kToks.length - 1]);
        if (lastIn !== lastK) return false;
        const minLen = Math.min(firstIn.length, firstK.length);
        if (minLen < 3) return false;
        return firstIn === firstK || firstK.startsWith(firstIn) || firstIn.startsWith(firstK);
      })?.[1];
      if (hit4) return hit4;

      // Strategy 5: character multiset overlap ≥85% on first token + exact last token
      // Catches "snehal" ↔ "sneahaal" (all chars of "snehal" found in "sneahaal")
      const hit5 = Object.entries(MASTER_SCORES).find(([k]) => {
        const kToks = k.split(/\s+/).filter(Boolean);
        if (kToks.length < 2) return false;
        const firstK = alnum(kToks[0]);
        const lastK  = alnum(kToks[kToks.length - 1]);
        if (lastIn !== lastK) return false;
        const minLen = Math.min(firstIn.length, firstK.length);
        if (minLen < 4) return false;
        const shorter = firstIn.length <= firstK.length ? firstIn : firstK;
        const longer  = firstIn.length <= firstK.length ? firstK : firstIn;
        const freq = {};
        for (const c of longer) freq[c] = (freq[c] || 0) + 1;
        let overlap = 0;
        for (const c of shorter) { if (freq[c] > 0) { overlap++; freq[c]--; } }
        return overlap / shorter.length >= 0.85;
      })?.[1];
      if (hit5) return hit5;
    }
  }

  return null;
}

window.Admin = (() => {
  // ---- State ----
  let _editTopicId = null; // null = new, number = edit existing
  let _callerAudioBlob = null;
  let _callerRecording = false;
  let _botScriptAudioBlobs = []; // per-turn audio blobs (null = use TTS)
  let _botScriptRecording  = -1; // index of turn currently being recorded (-1 = none)
  let _botScriptRecPromise = null;
  let _scoringSessionId = null;
  let _topicsFilter = null; // specific module key once picked; null = no module chosen yet
  let _topicsGroup  = null; // 'manager' | 'trainee' | null = group chooser shown

  // Topics page module lists per group (2026-09-24 restructure, at the
  // manager's request): Listening & Tone and Mgmt Skills dropped from the
  // Manager list (no live module card links to either any more -- see
  // manager.html's 5-card module hub), and Role Play / GD / Written /
  // NRI Stock Market dropped from the Trainee list to declutter it down to
  // what's actively managed day to day.
  const TOPICS_GROUP_TABS = {
    manager: [
      { module: 'mgr-situation-room',     label: '🎯 Situation Room' },
      { module: 'mgr-transcript-autopsy', label: '📋 Transcript Autopsy' },
      { module: 'mgr-mock-call',          label: '📞 Mock Call' },
      { module: 'mgr-feedback',           label: '💬 Feedback' },
      { module: 'mgr-eq',                 label: '🧠 EQ' },
    ],
    // Shown under the Manager group as its own titled section (see
    // selectTopicsGroup): the NRI team's three assessments, same model as
    // the regular ones but with their own topic banks.
    nriManager: [
      { module: 'mgr-nri-situation-room',     label: '🎯 NRI Situation Room' },
      { module: 'mgr-nri-transcript-autopsy', label: '📋 NRI Transcript Autopsy' },
      { module: 'mgr-nri-mock-call',          label: '📞 NRI Paper Trade' },
    ],
    trainee: [
      { module: 'pick-speak-stock',        label: '📈 P&S Stock' },
      { module: 'pick-speak-general',      label: '💬 P&S General' },
      { module: 'mock-call',               label: 'Mock Call' },
      { module: 'ops-call-assessment',     label: '📞 Ops Escalation Call' },
      { module: 'ops-writing-assessment',  label: '✍️ Ops Escalation Writing' },
      { module: 'grammar-assessment',      label: 'Grammar' },
      { module: 'listening-assessment',    label: 'Listening' },
    ],
  };
  let _assessmentsFilter = { module: 'all', status: 'all', team: 'all' };
  let _currentFilteredSessions = [];
  let _teamAssignments = {};   // { traineeId: 'Team Name' }
  let _activeTraineeIds = new Set(); // IDs of trainees currently in the DB
  let _currentReportData = null; // { trainee, marks, scores, details }
  let _cachedSessions  = [];   // all sessions from last loadAssessments call
  let _cachedTopicMap  = {};   // topicId → topic from last loadAssessments call
  let _selectedTraineeIds = new Set(); // trainee ids checked in the trainees table
  let _allFilteredTrainees = [];       // trainees currently rendered in the table
  let _allTrainees = [];               // full unfiltered trainee list from last loadTrainees() call
  let _traineeSessionsForTable = [];   // all sessions, cached from last loadTrainees() call
  // Assessments multi-select + archive
  let _selectedSessionIds    = new Set(); // checked session ids
  let _allRenderedSessions   = [];        // sessions currently in the table
  let _selectedMgrSessionIds = new Set(); // checked session ids in the Manager Assessments table
  let _viewArchive           = false;     // false = Active tab, true = Archive tab
  let _archivedIds           = new Set(); // session IDs stored as archived (loaded from settings)
  // AI Audit Scores section
  let _allAuditRecords    = [];        // full list from DB
  let _filteredAuditRecs  = [];        // after search filter
  let _selectedAuditIds   = new Set(); // checked rows
  // Manager-wise view state
  let _currentManagerDrill   = null;       // null = manager summary, string = drill into that manager
  let _agentManagerIndex     = null;       // built lazily from _MANAGER_AGENT_MAP
  let _selectedManagerNames  = new Set();  // manager names with checkboxes checked
  let _comm360ReportDeleted  = false;

  // Convert legacy overall scores stored as raw /5 to /100
  function normalizeOverall(overall) {
    if (typeof overall !== 'number') return overall;
    return overall <= 5 ? parseFloat(((overall / 5) * 100).toFixed(1)) : overall;
  }

  // ---- Ticket Team Managers Set ----
  const TICKET_MANAGERS = new Set([
    'Swanand Dixit', 'Renuka Mishra', 'Basavaraj Gurav', 'Ratanjeet Maharaj', 
    'Girish A', 'Gopi Kiran', 'Shwethayini'
  ]);

  // ---- Module metadata ----
  const MODULE_LABELS = {
    'pick-speak':          'Pick & Speak',
    'pick-speak-general':  'P&S — General',
    'pick-speak-stock':    'P&S — Stock Market',
    'mock-call':           'Mock Call',
    'ops-call-assessment':    'Ops Escalation Call',
    'role-play':           'Role Play',
    'group-discussion':    'Group Discussion',
    'written-comm':        'Written Comm.',
    'ops-writing-assessment': 'Ops Escalation Writing',
    'grammar-assessment':  'Grammar Assessment',
    'listening-assessment': 'Listening Assessment',
    'stock-market-mcq':    'NRI Stock Market',
    'mgr-situation-room':    'Situation Room',
    'mgr-transcript-autopsy': 'Transcript Autopsy',
    'mgr-mock-call':         'Mock Call (Mgr)',
    'mgr-feedback':          'Feedback',
    'mgr-eq':                'EQ',
    'mgr-listening-tone':    'Listening & Tone',
    'mgr-management-skills': 'Mgmt Skills',
    'mgr-nri-situation-room':     'NRI Situation Room',
    'mgr-nri-transcript-autopsy': 'NRI Transcript Autopsy',
    'mgr-nri-mock-call':          'NRI Paper Trade'
  };

  const MODULE_COLORS = {
    'pick-speak':          '#3b82f6',
    'pick-speak-general':  '#3b82f6',
    'pick-speak-stock':    '#3b82f6',
    'mock-call':           '#8b5cf6',
    'ops-call-assessment':    '#8b5cf6',
    'role-play':           '#f97316',
    'group-discussion':    '#10b981',
    'written-comm':        '#0ea5e9',
    'ops-writing-assessment': '#0ea5e9',
    'grammar-assessment':  '#7c3aed',
    'listening-assessment': '#db2777'
  };

  const MODULE_BADGE_CLASS = {
    'pick-speak':          'badge-ps',
    'pick-speak-general':  'badge-ps',
    'pick-speak-stock':    'badge-ps',
    'mock-call':           'badge-mc',
    'ops-call-assessment':    'badge-mc',
    'role-play':           'badge-rp',
    'group-discussion':    'badge-gd',
    'written-comm':        'badge-wc',
    'ops-writing-assessment': 'badge-wc',
    'grammar-assessment':  'badge-ga',
    'listening-assessment': 'badge-la',
    'stock-market-mcq':    'badge-smq',
    'mgr-situation-room':    'badge-sr',
    'mgr-transcript-autopsy': 'badge-ta',
    'mgr-mock-call':         'badge-mc',
    'mgr-feedback':          'badge-fb',
    'mgr-eq':                'badge-eq',
    'mgr-listening-tone':    'badge-lt',
    'mgr-management-skills': 'badge-ms',
    'mgr-nri-situation-room':     'badge-sr',
    'mgr-nri-transcript-autopsy': 'badge-ta',
    'mgr-nri-mock-call':          'badge-mc'
  };

  // ---- Score Bands (scores are out of 100) ----
  const SCORE_BANDS = {
    'pick-speak': [
      { maxPct: 40, label: 'Needs Significant Improvement', cls: 'band-poor', icon: '⚠️',
        feedback: 'Significant gaps across multiple areas. Focus on building clarity of thought, reducing filler words, improving pace, and using more varied vocabulary. Practice structured speaking with a clear opening, body, and close.' },
      { maxPct: 60, label: 'Acceptable / Meets Expectations', cls: 'band-fair', icon: '📋',
        feedback: 'Meets basic expectations. Work on reducing filler words (um, uh, like), improving sentence variety, and covering the topic more thoroughly within the time given.' },
      { maxPct: 80, label: 'Good / Above Average', cls: 'band-good', icon: '👍',
        feedback: 'Good command of language and delivery. Refine by increasing vocabulary variety, tightening logical flow, and maintaining a more consistent pace throughout.' },
      { maxPct: Infinity, label: 'Excellent / Consistently Strong', cls: 'band-excellent', icon: '⭐',
        feedback: 'Consistently strong performance across all areas! Excellent fluency, rich vocabulary, professional tone, and well-structured delivery. Keep practising to maintain this standard.' }
    ],
    'mock-call': [
      { maxPct: 50, label: 'Needs Significant Improvement', cls: 'band-poor', icon: '⚠️',
        feedback: 'Key call-handling elements are missing or insufficient. Prioritise training on greeting structure, acknowledging the customer with empathy, probing questions, and proper call closings.' },
      { maxPct: 60, label: 'Acceptable / Meets Expectations', cls: 'band-fair', icon: '📋',
        feedback: 'Basic call-handling demonstrated. Work on consistent empathy phrases, clearer communication without fillers, and following hold and closing procedures every time.' },
      { maxPct: 70, label: 'Good / Above Average', cls: 'band-good', icon: '👍',
        feedback: 'Good customer service skills shown. Minor refinements needed — ensure the extra mile is offered and all hold/closing steps are followed precisely.' },
      { maxPct: Infinity, label: 'Excellent / Consistently Strong', cls: 'band-excellent', icon: '⭐',
        feedback: 'Consistently strong call quality! Excellent adherence to protocol, genuine empathy throughout, and professional communication from opening to closing.' }
    ]
  };
  // Ops Escalation Call uses the exact same rubric/bands as Mock Call (same
  // 7 parameters end-to-end — see SCORING_CRITERIA below).
  SCORE_BANDS['ops-call-assessment'] = SCORE_BANDS['mock-call'];

  function getBand(module, overallScore) {
    // overallScore is 0-100
    const bands = SCORE_BANDS[module];
    if (!bands || overallScore === null || overallScore === undefined) return null;
    return bands.find(b => overallScore < b.maxPct) || bands[bands.length - 1];
  }

  // Each criterion: { label, key, group?, desc?, scale135? }
  // group: shown as a section header in the scoring form
  // scale135: radio buttons 1 / 3 / 5 (Not Met / Partial / Fully Met)
  // default: 1-5 slider
  const SCORING_CRITERIA = {
    'pick-speak': [
      // ── 1. Content & Structure
      { group: '1. Content & Structure', label: 'Clarity of Thought', key: 'clarity',
        desc: 'Are ideas easy to understand? Is the message relevant to the topic?' },
      { group: '1. Content & Structure', label: 'Logical Flow / Structure', key: 'logicalFlow',
        desc: 'Clear opening, body, and closure; smooth transitions between points' },
      { group: '1. Content & Structure', label: 'Relevance to Topic', key: 'relevance',
        desc: 'Stays on topic; avoids unnecessary digressions' },
      // ── 2. Language & Grammar
      { group: '2. Language & Grammar', label: 'Grammar Accuracy', key: 'grammar',
        desc: 'Correct tense usage; proper sentence construction' },
      { group: '2. Language & Grammar', label: 'Vocabulary Appropriateness', key: 'vocabulary',
        desc: 'Suitable word choice; avoids slang or informal language' },
      { group: '2. Language & Grammar', label: 'Sentence Variety', key: 'sentenceVariety',
        desc: 'Mix of simple and compound sentences; avoids repetitive patterns' },
      // ── 3. Fluency & Delivery
      { group: '3. Fluency & Delivery', label: 'Fluency', key: 'fluency',
        desc: 'Minimal pauses or hesitation; natural speech rhythm' },
      { group: '3. Fluency & Delivery', label: 'Pace of Speech', key: 'pace',
        desc: 'Not too fast or slow; easy to follow' },
      { group: '3. Fluency & Delivery', label: 'Filler Word Control', key: 'fillerControl',
        desc: 'Limited use of "um," "uh," "actually," etc.' },
      // ── 4. Pronunciation & Voice
      { group: '4. Pronunciation & Voice', label: 'Pronunciation Clarity', key: 'pronunciation',
        desc: 'Words are understandable; key terms pronounced correctly' },
      { group: '4. Pronunciation & Voice', label: 'Intonation & Stress', key: 'intonation',
        desc: 'Appropriate emphasis; avoids monotone delivery' },
      { group: '4. Pronunciation & Voice', label: 'Volume & Audibility', key: 'volume',
        desc: 'Clear and confident voice level' },
      // ── 5. Confidence & Presence
      { group: '5. Confidence & Presence', label: 'Confidence', key: 'confidence',
        desc: 'Speaks without excessive self-correction; maintains composure' },
      // ── 6. Professionalism
      { group: '6. Professionalism', label: 'Tone & Professionalism', key: 'professionalism',
        desc: 'Respectful and appropriate tone; no negative or casual expressions' },
      { group: '6. Professionalism', label: 'Time Management', key: 'timeManagement',
        desc: 'Completes within given time; balanced coverage of points' },
    ],
    'mock-call': [
      { label: 'Call Opening',              key: 'callOpening',          desc: 'Greeting + self-intro + company intro + offer to assist (all 4 elements = 5)' },
      { label: 'Acknowledgment',            key: 'acknowledgment',       desc: 'Acknowledged issue promptly with genuine empathy' },
      { label: 'Communication Clarity',     key: 'communicationClarity', desc: 'Speech rate, grammar, tone, no fillers, no dead air' },
      { label: 'Call Essence',              key: 'callEssence',          desc: 'Politeness, empathy, rapport building throughout' },
      { label: 'Hold Procedure',            key: 'holdProcedure',        scale135: true, desc: 'Asked permission + reason + time expectation' },
      { label: 'Extra Mile',                key: 'extraMile',            scale135: true, desc: 'Offered proactive help beyond the asked query' },
      { label: 'Call Closing',              key: 'callClosing',          scale135: true, desc: 'Confirmed resolution + asked for anything else + branded close' }
    ],
    // Ops Escalation Call: same 7 parameters as Mock Call, on purpose — one
    // consistent, duplicate-free rubric so admin scores this exactly like a
    // regular Mock Call session (per request: "take all the parameters, do
    // not add any duplicate parameter, same parameters should be available
    // to admin"). See evaluateOpsCall() in claude.js for the matching AI side.
    'ops-call-assessment': [
      { label: 'Call Opening',              key: 'callOpening',          desc: 'Greeting + self-intro + company intro + offer to assist (all 4 elements = 5)' },
      { label: 'Acknowledgment',            key: 'acknowledgment',       desc: 'Acknowledged issue promptly with genuine empathy' },
      { label: 'Communication Clarity',     key: 'communicationClarity', desc: 'Speech rate, grammar, tone, no fillers, no dead air' },
      { label: 'Call Essence',              key: 'callEssence',          desc: 'Politeness, empathy, rapport building throughout' },
      { label: 'Hold Procedure',            key: 'holdProcedure',        scale135: true, desc: 'Asked permission + reason + time expectation' },
      { label: 'Extra Mile',                key: 'extraMile',            scale135: true, desc: 'Offered proactive help beyond the asked query' },
      { label: 'Call Closing',              key: 'callClosing',          scale135: true, desc: 'Confirmed resolution + asked for anything else + branded close' }
    ],
    'role-play': [
      { label: 'Empathy', key: 'criterion_0' },
      { label: 'Assertiveness', key: 'criterion_1' },
      { label: 'Resolution Approach', key: 'criterion_2' },
      { label: 'Professionalism', key: 'criterion_3' }
    ],
    'group-discussion': [
      { label: 'Participation Quality', key: 'criterion_0' },
      { label: 'Argumentation', key: 'criterion_1' },
      { label: 'Responsiveness', key: 'criterion_2' },
      { label: 'Communication Clarity', key: 'criterion_3' }
    ],
    'written-comm': [
      { label: 'Tone & Empathy', key: 'criterion_0', desc: 'Remained polite and professional; acknowledged customer\'s actual concern and policy rationale with empathy' },
      { label: 'Clarity', key: 'criterion_1', desc: 'Clear, consistent, and non-contradictory explanation (no saying "disabled" and later "no restriction")' },
      { label: 'Ownership', key: 'criterion_2', desc: 'Addressed customer\'s underlying questions, reasoning behind internal policies, and why they questioned it' },
      { label: 'Accuracy', key: 'criterion_3', desc: 'Correctly clarified internal safeguards, differentiated UI restrictions vs. manual support options' },
      { label: 'Customer Education', key: 'criterion_4', desc: 'Explained the business rationale/safeguards clearly instead of using generic statements' },
      { label: 'Grammar & Language', key: 'criterion_5', desc: 'Grammar, spelling (e.g. no "inconvinence"), professional sentence construction, and no repetitive closing statements' }
    ],
    // Grammar/Listening Assessment is auto-scored — no manual sliders, just admin comment
    'grammar-assessment':  [],
    'listening-assessment': []
  };

  // ---- Helpers ----
  function $(id) { return document.getElementById(id); }

  function toast(msg, type = '') {
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = msg;
    $('toast-container').appendChild(el);
    setTimeout(() => {
      el.style.animation = 'slide-out 0.25s ease forwards';
      setTimeout(() => el.remove(), 300);
    }, 3000);
  }

  function showSection(name) {
    document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const sec = $(`admin-${name}`);
    if (sec) sec.classList.add('active');
    document.querySelectorAll(`.nav-item[data-section="${name}"]`).forEach(n => n.classList.add('active'));
  }

  function formatDate(isoStr) {
    if (!isoStr) return '—';
    const d = new Date(isoStr);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) +
      ' ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  }

  function formatScore(score) {
    if (score === null || score === undefined) return '—';
    return typeof score === 'object' ? (score.overall ?? '—') : score;
  }

  function calcAdminAvg(adminScores) {
    if (!adminScores) return null;
    // If overall was already stored as /100, return it directly
    if (typeof adminScores.overall === 'number') return adminScores.overall;
    const vals = Object.entries(adminScores)
      .filter(([k, v]) => k !== 'overall' && typeof v === 'number')
      .map(([, v]) => v);
    if (!vals.length) return null;
    // Each criterion is 1-5; convert sum to 0-100
    return parseFloat(((vals.reduce((a, b) => a + b, 0) / (vals.length * 5)) * 100).toFixed(1));
  }

  function statusBadge(status) {
    const map = {
      'pending': '<span class="badge badge-pending">Pending</span>',
      'ai-evaluated': '<span class="badge badge-ai">AI Scored</span>',
      'scored': '<span class="badge badge-scored">Scored</span>'
    };
    return map[status] || `<span class="badge">${status}</span>`;
  }

  function moduleBadge(module) {
    return `<span class="module-badge ${MODULE_BADGE_CLASS[module] || ''}">${MODULE_LABELS[module] || module}</span>`;
  }

  // ---- Auth ----
  function showAdminName() {
    const name = sessionStorage.getItem('adminName');
    const el = $('admin-logged-in-name');
    const logoutBtn = $('btn-admin-logout');
    if (name && el) {
      el.textContent = `Signed in as ${name}`;
      el.style.display = 'block';
    }
    if (logoutBtn) {
      logoutBtn.style.display = '';
      // Always bind here so it works whether session was restored or just logged in
      logoutBtn.onclick = (e) => {
        e.preventDefault();
        sessionStorage.removeItem('adminAuth');
        sessionStorage.removeItem('adminName');
        location.reload();
      };
    }
  }

  // NOTE: this was mistakenly renamed to _unused_initApp() at some point
  // (presumably taken for dead code) while doLogin() and initAuth() kept
  // calling it as initApp() -- that mismatch is what threw "initApp is not
  // defined" and stopped the Topics list, dashboard, reports, audit scores
  // and manager assessments from ever rendering. Restoring the real name.
  function initApp() {
    document.querySelectorAll('.sidebar-nav .nav-item[data-section]').forEach(item => {
      item.onclick = (e) => {
        e.preventDefault();
        const section = item.getAttribute('data-section');
        if (section) showSection(section);
        // Re-fetch from the DB every time the Assessments tab is opened, not
        // just once at login — a call submitted after login (by anyone,
        // from any device) would otherwise never appear until a full page
        // reload, since nothing else re-triggers this fetch.
        if (section === 'assessments') {
          try { loadAssessments(); } catch (_) {}
        }
        // Trainees tab: re-fetch every time it's opened, same reasoning as Assessments above.
        if (section === 'trainees') {
          try { loadTrainees(); } catch (_) {}
        }
        // Manager Assessments tab: same reasoning -- this was never wired to
        // re-fetch on open, so a manager's newly-completed assessment (and
        // the pending-review count badge) would stay stale/wrong until the
        // admin manually clicked "Refresh" or reloaded the whole page.
        if (section === 'mgr-assessments') {
          try { loadMgrAssessments(); } catch (_) {}
        }
        // Dashboard: same reasoning -- re-fetch every time it's opened so
        // the numbers reflect sessions submitted since the last visit,
        // not just whatever was true at login.
        if (section === 'dashboard') {
          try { loadDashboard(); } catch (_) {}
        }
      };
    });

    initTopics();
    initScoringModal();
    renderTopicsList();
    const traineeSearchEl = $('trainee-search');
    if (traineeSearchEl) traineeSearchEl.oninput = () => searchTrainees();
    const traineeModal = $('trainee-sessions-modal');
    if (traineeModal) {
      traineeModal.addEventListener('click', (e) => { if (e.target === traineeModal) closeTraineeSessionsModal(); });
    }
    try { loadTrainees(); } catch (_) {}
    try { loadDashboard(); } catch (_) {}
    try { if (typeof generateAllAgentsReport === 'function') generateAllAgentsReport(); } catch (_) {}
    try { if (typeof loadAiAuditScores === 'function') loadAiAuditScores(); } catch (_) {}
    try { if (typeof loadComm360Report === 'function') loadComm360Report(); } catch (_) {}
    try { if (typeof loadMgrAssessments === 'function') loadMgrAssessments(); } catch (_) {}
    try { loadAssessments(); } catch (_) {}
  }

  function doLogin() {
    try {
      const usernameInput = $('admin-username-input');
      const username = (usernameInput ? usernameInput.value : '').trim() || 'admin';
      try {
        sessionStorage.setItem('adminAuth', 'true');
        sessionStorage.setItem('adminName', username);
      } catch (_) {}

      const modal = $('admin-auth-modal');
      if (modal) {
        modal.classList.add('hidden');
        modal.style.setProperty('display', 'none', 'important');
      }

      const app = $('admin-app');
      if (app) {
        app.classList.remove('hidden');
        app.style.setProperty('display', 'block', 'important');
      }

      showAdminName();
      initApp();
    } catch (e) {
      console.error('doLogin error:', e);
      const modal = $('admin-auth-modal');
      if (modal) {
        modal.classList.add('hidden');
        modal.style.setProperty('display', 'none', 'important');
      }
      const app = $('admin-app');
      if (app) {
        app.classList.remove('hidden');
        app.style.setProperty('display', 'block', 'important');
      }
    }
  }

  function initAuth() {
    try { sessionStorage.setItem('adminAuth', 'true'); } catch (_) {}
    const modal = $('admin-auth-modal');
    if (modal) {
      modal.classList.add('hidden');
      modal.style.setProperty('display', 'none', 'important');
    }
    const app = $('admin-app');
    if (app) {
      app.classList.remove('hidden');
      app.style.setProperty('display', 'block', 'important');
    }
    showAdminName();
    initApp();
  }

  // ---- Init ----
  async function init() {
    initAuth();
    try {
      await DB.init();
    } catch (e) {
      console.warn('[Admin] DB.init warning:', e);
    }
  }

  // ================================================================
  //  TRAINEES TAB
  // ================================================================
  // The Trainees table (trainees-tbody) was never populated by any code
  // path -- _selectedTraineeIds/_allFilteredTrainees were declared but
  // nothing ever loaded a trainee into them, and the checkbox/team/action
  // buttons in admin.html called Admin.toggleAllTrainees / .deleteSelectedTrainees /
  // .deleteAllTrainees / .setTraineeTeam / .viewTraineeSessions, none of which
  // existed. Implemented from scratch below, reusing the trainees + sessions
  // data already loaded elsewhere (DB 'trainees' store, computeAgentScores()).

  async function _loadTeamAssignments() {
    try {
      const rec = await DB.get('settings', 'traineeTeamAssignments');
      _teamAssignments = (rec && rec.value) ? JSON.parse(rec.value) : {};
    } catch (e) {
      console.warn('_loadTeamAssignments failed:', e);
      _teamAssignments = {};
    }
  }

  async function loadTrainees() {
    const tbody = $('trainees-tbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="7" class="empty-state">Loading…</td></tr>';
    try {
      const [trainees, sessions] = await Promise.all([DB.getAll('trainees'), DB.getAll('sessions')]);
      if (!Object.keys(_teamAssignments).length) await _loadTeamAssignments();
      _allTrainees = trainees;
      _traineeSessionsForTable = sessions;
      _renderTraineesTable();
    } catch (e) {
      console.error('loadTrainees error:', e);
      tbody.innerHTML = `<tr><td colspan="7" class="empty-state">Failed to load trainees: ${e.message}</td></tr>`;
    }
  }

  function _updateTraineeActionBtns() {
    const btn = $('btn-delete-selected-trainees');
    if (!btn) return;
    const n = _selectedTraineeIds.size;
    btn.disabled = n === 0;
    btn.textContent = n > 0 ? `🗑 Delete Selected (${n})` : '🗑 Delete Selected';
  }

  function _renderTraineesTable() {
    const tbody = $('trainees-tbody');
    if (!tbody) return;
    const searchEl = $('trainee-search');
    const q = ((searchEl && searchEl.value) || '').trim().toLowerCase();
    const sessions = _traineeSessionsForTable;

    let rows = _allTrainees.filter(t => !q || (t.name || '').toLowerCase().includes(q));
    rows.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    _allFilteredTrainees = rows;

    // Drop selections for trainees no longer in view (deleted or filtered out)
    const visibleIds = new Set(rows.map(t => t.id));
    [..._selectedTraineeIds].forEach(id => { if (!visibleIds.has(id)) _selectedTraineeIds.delete(id); });

    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="7" class="empty-state">${q ? 'No trainees match your search.' : 'No trainees yet.'}</td></tr>`;
      _updateTraineeActionBtns();
      const allCb = $('select-all-trainees');
      if (allCb) { allCb.checked = false; allCb.indeterminate = false; }
      return;
    }

    tbody.innerHTML = rows.map(t => {
      const tSessions = sessions.filter(s => s.traineeId === t.id);
      const sessionCount = tSessions.length;
      const lastActive = tSessions.reduce((max, s) => {
        if (!s.submittedAt) return max;
        return (!max || new Date(s.submittedAt) > new Date(max)) ? s.submittedAt : max;
      }, null);
      const { overall } = computeAgentScores(t.id, sessions);
      const team = _teamAssignments[t.id] || '';
      const checked = _selectedTraineeIds.has(t.id) ? 'checked' : '';
      const safeName = (t.name || 'Unknown').replace(/</g, '&lt;');
      const safeTeam = team.replace(/"/g, '&quot;');
      return `<tr>
        <td style="text-align:center"><input type="checkbox" class="trainee-cb" ${checked} onchange="Admin.toggleTraineeCheckbox('${t.id}', this.checked)" /></td>
        <td><strong>${safeName}</strong></td>
        <td style="text-align:center">${sessionCount}</td>
        <td>${lastActive ? formatDate(lastActive) : '—'}</td>
        <td style="text-align:center">${overall != null ? overall + '%' : '—'}</td>
        <td>
          <input type="text" class="team-input" value="${safeTeam}" placeholder="Unassigned"
            style="width:140px;font-size:0.82rem;padding:0.3rem 0.5rem;border:1px solid var(--border);border-radius:6px"
            onkeydown="if(event.key==='Enter'){Admin.setTraineeTeam('${t.id}', this.value); this.blur();}"
            title="Type a team name and press Enter to save" />
        </td>
        <td><button class="btn-ghost" style="font-size:0.78rem;padding:0.3rem 0.6rem;white-space:nowrap" onclick="Admin.viewTraineeSessions('${t.id}')">👁 View Sessions</button></td>
      </tr>`;
    }).join('');

    _updateTraineeActionBtns();
    const allCb = $('select-all-trainees');
    if (allCb) {
      const n = _selectedTraineeIds.size;
      allCb.indeterminate = n > 0 && n < rows.length;
      allCb.checked = n > 0 && n === rows.length;
    }
  }

  function searchTrainees() {
    _renderTraineesTable();
  }

  function toggleTraineeCheckbox(id, checked) {
    if (checked) _selectedTraineeIds.add(id);
    else _selectedTraineeIds.delete(id);
    _updateTraineeActionBtns();
    const allCb = $('select-all-trainees');
    if (allCb && _allFilteredTrainees.length > 0) {
      const n = _selectedTraineeIds.size;
      allCb.indeterminate = n > 0 && n < _allFilteredTrainees.length;
      allCb.checked = n === _allFilteredTrainees.length;
    }
  }

  function toggleAllTrainees(checked) {
    if (checked) _allFilteredTrainees.forEach(t => _selectedTraineeIds.add(t.id));
    else _allFilteredTrainees.forEach(t => _selectedTraineeIds.delete(t.id));
    document.querySelectorAll('.trainee-cb').forEach(cb => { cb.checked = checked; });
    _updateTraineeActionBtns();
  }

  async function setTraineeTeam(traineeId, teamName) {
    const name = (teamName || '').trim();
    if (name) _teamAssignments[traineeId] = name;
    else delete _teamAssignments[traineeId];
    try {
      await DB.put('settings', { key: 'traineeTeamAssignments', value: JSON.stringify(_teamAssignments) });
      toast(name ? `Team set to "${name}".` : 'Team assignment cleared.', 'success');
    } catch (e) {
      console.error('setTraineeTeam error:', e);
      toast('Failed to save team assignment: ' + e.message, 'error');
    }
  }

  async function deleteSelectedTrainees() {
    const n = _selectedTraineeIds.size;
    if (!n) return;
    const names = _allFilteredTrainees.filter(t => _selectedTraineeIds.has(t.id)).map(t => t.name || 'Unknown').join(', ');
    const confirmed = confirm(
      `Delete ${n} selected trainee(s) from the roster?\n\n${names}\n\nThis removes them from the Trainees list. Their past assessment records are kept in the Assessments tab.`
    );
    if (!confirmed) return;
    let failed = 0;
    for (const id of [..._selectedTraineeIds]) {
      try { await DB.del('trainees', id); } catch (e) { console.error('Delete trainee failed:', id, e); failed++; }
    }
    _selectedTraineeIds.clear();
    toast(failed ? `Deleted ${n - failed} of ${n} trainee(s) — ${failed} failed.` : `Deleted ${n} trainee(s).`, failed ? 'error' : 'success');
    loadTrainees();
  }

  async function deleteAllTrainees() {
    if (!_allTrainees.length) { toast('No trainees to delete.', ''); return; }
    const step1 = confirm(`Delete ALL ${_allTrainees.length} trainees from the roster?\n\nThis cannot be undone. Their past assessment records are kept in the Assessments tab.`);
    if (!step1) return;
    const step2 = confirm('Are you absolutely sure? This will permanently remove every trainee from the roster.');
    if (!step2) return;
    let failed = 0;
    const total = _allTrainees.length;
    for (const t of [..._allTrainees]) {
      try { await DB.del('trainees', t.id); } catch (e) { console.error('Delete trainee failed:', t.id, e); failed++; }
    }
    _selectedTraineeIds.clear();
    toast(failed ? `Deleted ${total - failed} of ${total} trainee(s) — ${failed} failed.` : 'All trainees deleted.', failed ? 'error' : 'success');
    loadTrainees();
  }

  function viewTraineeSessions(traineeId) {
    const trainee = _allTrainees.find(t => t.id === traineeId);
    const sessions = _traineeSessionsForTable
      .filter(s => s.traineeId === traineeId)
      .sort((a, b) => new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0));
    const modal = $('trainee-sessions-modal');
    const title = $('trainee-sessions-title');
    const tbody = $('trainee-sessions-tbody');
    if (!modal || !tbody) return;
    if (title) title.textContent = `Sessions — ${trainee ? trainee.name : 'Unknown trainee'}`;
    if (!sessions.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="empty-state">No sessions found for this trainee.</td></tr>';
    } else {
      tbody.innerHTML = sessions.map(s => {
        const aiScore    = s.aiScores    ? normalizeOverall(s.aiScores.overall) : null;
        const adminScore = s.adminScores ? calcAdminAvg(s.adminScores)          : null;
        return `<tr>
          <td>${moduleBadge(s.module)}</td>
          <td>${s.topicTitle || '—'}</td>
          <td>${formatDate(s.submittedAt)}</td>
          <td style="text-align:center">${aiScore != null ? aiScore + '%' : '—'}</td>
          <td style="text-align:center">${adminScore != null ? adminScore + '%' : '—'}</td>
        </tr>`;
      }).join('');
    }
    modal.classList.remove('hidden');
  }

  function closeTraineeSessionsModal() {
    const modal = $('trainee-sessions-modal');
    if (modal) modal.classList.add('hidden');
  }

  // ================================================================
  //  ALL AGENTS REPORT
  // ================================================================

  const PS_MODS_REPORT = new Set(['pick-speak', 'pick-speak-general', 'pick-speak-stock']);

  // Helper: given a list of P&S sessions for one trainee, return the average effective score
  function psAvgEff(sessions) {
    const effs = sessions.map(s => {
      const aN = s.adminScores ? (calcAdminAvg(s.adminScores) ?? null) : null;
      const iN = s.aiScores    ? (normalizeOverall(s.aiScores.overall) ?? null) : null;
      return aN !== null ? aN : iN;
    }).filter(x => x !== null);
    if (!effs.length) return null;
    return parseFloat((effs.reduce((a, b) => a + b, 0) / effs.length).toFixed(1));
  }

  // Helper: effective score for a single session
  function effScore(s) {
    const aN = s.adminScores ? (calcAdminAvg(s.adminScores) ?? null) : null;
    const iN = s.aiScores    ? (normalizeOverall(s.aiScores.overall) ?? null) : null;
    return aN !== null ? aN : iN;
  }

  // ---- Rule-based insight generator ----
  function buildAgentInsights(scores, details) {
    const strengths  = [];
    const priorities = [];
    const actions    = [];

    // ── Pick & Speak ──────────────────────────────────────────────
    const ps = scores['pick-speak'];
    if (ps !== null && ps !== undefined) {
      if (ps >= 80) {
        strengths.push(`Excellent spoken communication — delivers clear, structured and fluent responses (P&S: ${ps}%)`);
      } else if (ps >= 65) {
        strengths.push(`Above-average spoken delivery with good topic command (P&S: ${ps}%)`);
      } else {
        priorities.push(`Spoken communication (Pick & Speak: ${ps}%) — structure, delivery and vocabulary need development`);
      }

      // Sub-criteria from AI scores of the best P&S session
      const bestPS = (details['pick-speak'] || []).reduce((b, s) => {
        const e = effScore(s); const be = effScore(b);
        return (e !== null && (be === null || e > be)) ? s : b;
      }, details['pick-speak']?.[0] || null);

      if (bestPS?.aiScores) {
        const ai = bestPS.aiScores;
        const subStrong = [], subWeak = [];
        if (typeof ai.fluency        === 'number') (ai.fluency        >= 4 ? subStrong : subWeak).push('Fluency');
        if (typeof ai.vocabulary     === 'number') (ai.vocabulary     >= 4 ? subStrong : subWeak).push('Vocabulary');
        if (typeof ai.contentCoverage === 'number') (ai.contentCoverage >= 4 ? subStrong : subWeak).push('Content Coverage');

        if (subStrong.length) strengths.push(`P&S strengths: ${subStrong.join(', ')}`);
        if (subWeak.length)   priorities.push(`P&S sub-areas to improve: ${subWeak.join(', ')}`);

        if (subWeak.includes('Fluency')) {
          actions.push('Spoken Fluency: Record a 2-minute talk on any topic every day, replay it and count filler words (um, uh, like, you know). Target zero fillers within 2 weeks.');
        }
        if (subWeak.includes('Vocabulary')) {
          actions.push('Vocabulary Building: Read one financial news article (Economic Times / Mint) daily — highlight 5 unfamiliar words, look them up and use each in a sentence by end of day.');
        }
        if (subWeak.includes('Content Coverage')) {
          actions.push('Content Structure: Practice the PREP method (Point → Reason → Example → Point) for every Pick & Speak topic. Prepare 5 topics per week using this framework before attempting them.');
        }
      } else if (ps < 70) {
        actions.push('Pick & Speak: Practice 10-minute structured talks daily using the PREP framework (Point, Reason, Example, Point) — record yourself and review for clarity and completeness.');
      }
    }

    // ── Mock Call / Mock Ticket ───────────────────────────────────
    const mc = scores['mock-call'];
    if (mc !== null && mc !== undefined) {
      const firstSess = Object.values(details).find(lst => lst && lst.length)?.[0];
      const traineeName = firstSess ? firstSess.traineeName : null;
      const traineeId = firstSess ? firstSess.traineeId : null;
      const mgr = traineeId ? (_teamAssignments[traineeId] || _getAgentManager(traineeName)) : _getAgentManager(traineeName);
      const isTicketsTeam = TICKET_MANAGERS.has(mgr) || (details['mock-call'] && details['mock-call'].some(s => s.module === 'written-comm'));

      if (isTicketsTeam) {
        // --- TICKETS TEAM (WRITTEN COMM) INSIGHTS ---
        if (mc >= 75) {
          strengths.push(`Strong written communication — professional response clarity and well-structured email responses (Mock Ticket: ${mc}%)`);
        } else if (mc >= 60) {
          strengths.push(`Developing written skills — basic structure and professional greeting/closing present (Mock Ticket: ${mc}%)`);
        } else {
          priorities.push(`Mock Ticket (${mc}%) — needs focused work on tone consistency, clarity of explanations, and business rationale`);
        }

        const mcSessions = (details['mock-call'] || []).sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
        const latestMC   = mcSessions[0];
        if (latestMC) {
          const cr = { ...(latestMC.aiScores || {}), ...(latestMC.adminScores || {}) };
          const strong = [], weak = [];
          const CRIT = [
            { key: 'criterion_0', label: 'Tone & Empathy' },
            { key: 'criterion_1', label: 'Written Clarity' },
            { key: 'criterion_2', label: 'Ownership' },
            { key: 'criterion_3', label: 'Explanation Accuracy' },
            { key: 'criterion_4', label: 'Customer Education' },
            { key: 'criterion_5', label: 'Grammar & Language' }
          ];
          CRIT.forEach(({ key, label }) => {
            if (typeof cr[key] === 'number') (cr[key] >= 4 ? strong : weak).push(label);
          });
          if (strong.length) strengths.push(`Mock Ticket strengths: ${strong.join(', ')}`);
          if (weak.length)   priorities.push(`Mock Ticket areas to improve: ${weak.join(', ')}`);

          if (weak.includes('Tone & Empathy')) {
            actions.push('Tone & Empathy: Avoid generic/repetitive apologies like "We regret the inconvenience caused". Always acknowledge the customer\'s specific concern about autonomy or policy rationale to show true empathy.');
          }
          if (weak.includes('Written Clarity')) {
            actions.push('Written Clarity: Avoid contradictory statements (e.g. saying "option is disabled" and later "no restriction"). Be precise: explain that the Console interface disables self-service, but support can assist manually.');
          }
          if (weak.includes('Ownership')) {
            actions.push('Ownership: Directly answer the customer\'s underlying question (e.g. why the decision is made on their behalf) rather than just stating policy rules or offering manual orders.');
          }
          if (weak.includes('Explanation Accuracy')) {
            actions.push('Accuracy: Ensure clear distinction between UI restrictions and backend workarounds. Explain internal rules as safeguards rather than regulatory mandates where applicable.');
          }
          if (weak.includes('Customer Education')) {
            actions.push('Customer Education: Avoid generic safeguard statements. Provide a clear business rationale (e.g., "This prevents accidental acceptance of a takeover at a lower price than prevailing market rate, protecting from financial disadvantage").');
          }
          if (weak.includes('Grammar & Language')) {
            actions.push('Grammar & Language: Eliminate spelling errors (such as "inconvinence"), build concise sentences, and reduce repetitive template-like closing statements.');
          }
        }

        if (actions.length === 0 && mc < 70) {
          actions.push('Structured Response Practice: Use the Answer → Explain Rationale → Present Options structure for every ticket reply. Peer-review 3 draft replies daily before sending.');
        }

      } else {
        // --- REGULAR MOCK CALL INSIGHTS ---
        if (mc >= 75) {
          strengths.push(`Strong call-handling skills — professional communication with good protocol adherence (Mock Call: ${mc}%)`);
        } else if (mc >= 60) {
          strengths.push(`Developing call management skills — core competencies present (Mock Call: ${mc}%)`);
        } else {
          priorities.push(`Mock Call (${mc}%) — needs focused work on greeting structure, empathy language and call protocol`);
        }

        // Check individual criteria
        const mcSessions = (details['mock-call'] || []).sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
        const latestMC   = mcSessions[0];
        if (latestMC) {
          const cr = { ...(latestMC.aiScores || {}), ...(latestMC.adminScores || {}) };
          const strong = [], weak = [];
          const CRIT = [
            { key: 'callOpening',          label: 'Call Opening'           },
            { key: 'acknowledgment',        label: 'Acknowledgment & Empathy' },
            { key: 'communicationClarity',  label: 'Communication Clarity' },
            { key: 'callEssence',           label: 'Call Essence'          },
            { key: 'holdProcedure',         label: 'Hold Procedure'        },
            { key: 'extraMile',             label: 'Going the Extra Mile'  },
            { key: 'callClosing',           label: 'Call Closing'          },
          ];
          CRIT.forEach(({ key, label }) => {
            if (typeof cr[key] === 'number') (cr[key] >= 4 ? strong : weak).push(label);
          });
          if (strong.length) strengths.push(`Mock Call strengths: ${strong.join(', ')}`);
          if (weak.length)   priorities.push(`Mock Call areas to improve: ${weak.join(', ')}`);

          if (weak.includes('Call Opening')) {
            actions.push('Call Opening: Memorise the full greeting script until automatic — "Good [morning/afternoon], thank you for calling [Company], this is [Name], how may I assist you today?" Practise aloud 10× daily.');
          }
          if (weak.includes('Acknowledgment & Empathy')) {
            actions.push('Empathy Language: Open every customer response with an empathy phrase. Practise these until natural: "I completely understand your concern" / "I can see how this is frustrating, let me sort this for you right away."');
          }
          if (weak.includes('Hold Procedure')) {
            actions.push('Hold Protocol: Always follow 3 steps — (1) Ask permission: "May I place you on a brief hold?" (2) Give reason + time: "I need 2 minutes to check this for you." (3) Thank on return: "Thank you for holding." Role-play this 5× daily with a colleague.');
          }
        }

        if (actions.filter(a => a.startsWith('Call') || a.startsWith('Mock') || a.startsWith('Empathy') || a.startsWith('Hold')).length === 0 && mc < 70) {
          actions.push('Mock Call Practice: Role-play 3 full mock calls per week with a colleague — one person plays the customer, the other is the agent. Record and review together for missed protocol steps.');
        }
      }
    } else {
      // No mock call score yet
      priorities.push('Mock Call — assessment pending; complete at least one scored mock call session to build profile');
    }

    // ── Grammar Assessment ────────────────────────────────────────
    const ga = scores['grammar-assessment'];
    if (ga !== null && ga !== undefined) {
      if (ga >= 80) {
        strengths.push(`Excellent grammatical accuracy across MCQ, fill-in-blank and sentence correction (Grammar: ${ga}%)`);
      } else if (ga >= 65) {
        strengths.push(`Good grammar foundation with solid MCQ performance (Grammar: ${ga}%)`);
      } else {
        priorities.push(`Grammar (${ga}%) — gaps in conditional structures, preposition use or error recognition`);
      }

      // Section breakdown
      const gaSessions = (details['grammar-assessment'] || []).sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
      const latestGA   = gaSessions[0];
      if (latestGA) {
        try {
          const parsed = JSON.parse(latestGA.writtenText || '{}');
          if (parsed.sections) {
            const secLabels = { 0: 'Section A (MCQ)', 1: 'Section B (Fill-in-blank)', 2: 'Section C (Sentence Correction)' };
            const weakSecs  = parsed.sections
              .filter((sec, i) => sec.maxMarks > 0 && (sec.marksObtained / sec.maxMarks) < 0.6)
              .map((sec, i) => {
                const letter = sec.title?.match(/Section\s+([A-C])/i)?.[1];
                const idx    = letter ? letter.charCodeAt(0) - 65 : i;
                const pct    = Math.round((sec.marksObtained / sec.maxMarks) * 100);
                return `${secLabels[idx] || `Section ${letter || i + 1}`} (${pct}%)`;
              });
            if (weakSecs.length) priorities.push(`Grammar weak sections: ${weakSecs.join(', ')}`);
          }
        } catch (_) {}
      }

      if (ga < 75) {
        actions.push('Grammar Practice: Complete 15 targeted grammar exercises per week covering conditionals, prepositions, tenses and subject-verb agreement. Review every incorrect answer explanation before moving on — understanding the rule matters more than the score.');
      }
    }

    // ── Listening Assessment ──────────────────────────────────────
    const la = scores['listening-assessment'];
    if (la !== null && la !== undefined) {
      if (la >= 80) {
        strengths.push(`Outstanding comprehension — follows complex audio, video, call and reading content with accuracy (Listening: ${la}%)`);
      } else if (la >= 65) {
        strengths.push(`Good listening comprehension for audio and video content (Listening: ${la}%)`);
      } else {
        priorities.push(`Listening comprehension (${la}%) — needs improvement in processing audio, calls and reading material under time pressure`);
      }

      // Section breakdown
      const laSessions = (details['listening-assessment'] || []).sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
      const latestLA   = laSessions[0];
      if (latestLA) {
        try {
          const parsed = JSON.parse(latestLA.writtenText || '{}');
          if (parsed.sections) {
            const weakSecs = parsed.sections
              .filter(sec => sec.maxMarks > 0 && (sec.marksObtained / sec.maxMarks) < 0.6)
              .map(sec => {
                const pct = Math.round((sec.marksObtained / sec.maxMarks) * 100);
                return `${sec.sectionType || sec.title || 'Section'} (${pct}%)`;
              });
            if (weakSecs.length) priorities.push(`Listening weak sections: ${weakSecs.join(', ')}`);
          }
        } catch (_) {}
      }

      if (la < 75) {
        actions.push('Active Listening: Listen to a 5-minute financial news podcast (ET Money / Zerodha Varsity audio) each day. Pause at the end, write a 5-point summary without replaying. Then re-listen and compare — close the gaps in what you missed.');
      }
    }

    // ── Fallback strengths / generic actions ─────────────────────
    if (strengths.length === 0) {
      strengths.push('Shows commitment to professional development by completing communication assessments');
    }
    if (actions.length === 0) {
      actions.push('Schedule a 30-minute self-review session every week — replay recordings, rework grammar corrections and re-listen to sections where marks were dropped.');
    }
    // Cap to 3 actions
    return { strengths, priorities, actions: actions.slice(0, 3) };
  }

  // ---- Compute per-trainee module scores from sessions ----
  function computeAgentScores(traineeId, allSessions) {
    const ts = allSessions.filter(s => s.traineeId === traineeId);
    const scores  = {};
    const details = {};

    // P&S
    const psSess = ts.filter(s => PS_MODS_REPORT.has(s.module));
    if (psSess.length) {
      const avg = psAvgEff(psSess);
      if (avg !== null) { scores['pick-speak'] = avg; details['pick-speak'] = psSess; }
    }

    // Mock Call
    const mcSess = ts.filter(s => s.module === 'mock-call');
    if (mcSess.length) {
      const effs = mcSess.map(effScore).filter(x => x !== null);
      if (effs.length) {
        scores['mock-call'] = parseFloat((effs.reduce((a, b) => a + b, 0) / effs.length).toFixed(1));
        details['mock-call'] = mcSess;
      }
    }

    // Written Comm (Mock Ticket)
    const wcSess = ts.filter(s => s.module === 'written-comm');
    if (wcSess.length) {
      const effs = wcSess.map(effScore).filter(x => x !== null);
      if (effs.length) {
        scores['written-comm'] = parseFloat((effs.reduce((a, b) => a + b, 0) / effs.length).toFixed(1));
        details['written-comm'] = wcSess;
      }
    }

    // Tickets team check: replace mock-call with written-comm
    const mgr = _teamAssignments[traineeId] || _getAgentManager(ts.find(s => s.traineeId === traineeId)?.traineeName);
    const isTicketsTeam = TICKET_MANAGERS.has(mgr) || scores['written-comm'] != null;
    if (isTicketsTeam) {
      if (scores['written-comm'] != null) {
        scores['mock-call'] = scores['written-comm'];
        details['mock-call'] = details['written-comm'];
      }
      delete scores['written-comm'];
      delete details['written-comm'];
    }

    // Grammar: take admin score if present, otherwise latest session's auto-graded score. No averaging.
    const gaSess = ts.filter(s => s.module === 'grammar-assessment');
    if (gaSess.length) {
      const sortedGa = [...gaSess].sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
      const scoredSess = sortedGa.find(s => s.adminScores && s.adminScores.overall != null);
      const targetSess = scoredSess || sortedGa[0];
      const scoreVal = effScore(targetSess);
      if (scoreVal != null) {
        scores['grammar-assessment'] = scoreVal;
        details['grammar-assessment'] = gaSess;
      }
    }

    // Listening: take admin score if present, otherwise latest session's auto-graded score. No averaging.
    const laSess = ts.filter(s => s.module === 'listening-assessment');
    if (laSess.length) {
      const sortedLa = [...laSess].sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
      const scoredSess = sortedLa.find(s => s.adminScores && s.adminScores.overall != null);
      const targetSess = scoredSess || sortedLa[0];
      const scoreVal = effScore(targetSess);
      if (scoreVal != null) {
        scores['listening-assessment'] = scoreVal;
        details['listening-assessment'] = laSess;
      }
    }

    const available = Object.values(scores).filter(v => v != null);
    const overall   = available.length
      ? parseFloat((available.reduce((a, b) => a + b, 0) / available.length).toFixed(1))
      : null;

    return { scores, details, overall };
  }

  // ---- Render the full report ----
  function renderAllAgentsReport(agentRows) {
    const container = $('all-agents-report');
    if (!container) return;

    if (!agentRows.length) {
      container.innerHTML = `<p style="padding:1rem;color:var(--text-muted)">No assessments found for Pick &amp; Speak, Mock Call, Grammar or Listening.</p>`;
      container.classList.remove('hidden');
      return;
    }

    const today = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });

    const scoreColor = v => v == null ? '#94a3b8' : v >= 70 ? '#059669' : v >= 50 ? '#d97706' : '#dc2626';
    const scoreBand  = v => v == null ? '—' : v >= 70 ? 'On Track' : v >= 50 ? 'Developing' : 'Needs Attention';
    const fmtScore   = v => v != null ? `${v}%` : '—';

    // ── Summary table ─────────────────────────────────────────────
    const summaryRows = agentRows.map(({ trainee, scores, overall }) => `
      <tr>
        <td><strong>${trainee.name}</strong>${trainee.employee_id ? `<br><span style="font-size:0.75rem;color:var(--text-muted)">${trainee.employee_id}</span>` : ''}</td>
        <td style="text-align:center;font-weight:600;color:${scoreColor(scores['pick-speak'])}">${fmtScore(scores['pick-speak'])}</td>
        <td style="text-align:center;font-weight:600;color:${scoreColor(scores['mock-call'])}">${scores['mock-call'] != null ? fmtScore(scores['mock-call']) : '<span style="color:#94a3b8;font-size:0.8rem">Pending</span>'}</td>
        <td style="text-align:center;font-weight:600;color:${scoreColor(scores['grammar-assessment'])}">${fmtScore(scores['grammar-assessment'])}</td>
        <td style="text-align:center;font-weight:600;color:${scoreColor(scores['listening-assessment'])}">${fmtScore(scores['listening-assessment'])}</td>
        <td style="text-align:center;font-weight:800;font-size:1rem;color:${scoreColor(overall)}">${fmtScore(overall)}</td>
      </tr>`).join('');

    // ── Individual agent cards ────────────────────────────────────
    const cards = agentRows.map(({ trainee, scores, overall, insights }) => {
      const isTkt = trainee && (TICKET_MANAGERS.has(_teamAssignments[trainee.id]) || TICKET_MANAGERS.has(_getAgentManager(trainee.name)));
      const modules = [
        { key: 'pick-speak',          label: 'Pick & Speak',  color: '#3b82f6' },
        { key: 'mock-call',           label: isTkt ? 'Mock Ticket' : 'Mock Call', color: '#8b5cf6', pending: scores['mock-call'] == null },
        { key: 'grammar-assessment',  label: 'Grammar',       color: '#7c3aed' },
        { key: 'listening-assessment',label: 'Listening',     color: '#db2877' },
      ];

      const scorePills = modules.map(m => `
        <div class="aar-pill">
          <div class="aar-pill-score" style="color:${m.pending ? '#94a3b8' : scoreColor(scores[m.key])}">${m.pending ? 'Pending' : fmtScore(scores[m.key])}</div>
          <div class="aar-pill-label">${m.label}</div>
        </div>`).join('');

      const ul = items => items.length
        ? items.map(x => `<li>${x}</li>`).join('')
        : '<li style="color:var(--text-muted)">Complete more assessments to populate this section</li>';

      return `
        <div class="aar-card">
          <div class="aar-card-header">
            <div>
              <div class="aar-name">${trainee.name}</div>
              ${trainee.employee_id ? `<div class="aar-emp">${trainee.employee_id}</div>` : ''}
            </div>
            <div class="aar-overall-wrap">
              <div class="aar-overall-score" style="color:${scoreColor(overall)}">${fmtScore(overall)}</div>
              <div class="aar-overall-band"  style="color:${scoreColor(overall)}">${scoreBand(overall)}</div>
            </div>
          </div>

          <div class="aar-pills">${scorePills}</div>

          <div class="aar-sections-grid">
            <div class="aar-section aar-strengths">
              <div class="aar-section-title">✅ Key Strengths</div>
              <ul>${ul(insights.strengths)}</ul>
            </div>
            <div class="aar-section aar-priorities">
              <div class="aar-section-title">🎯 Priority Areas</div>
              <ul>${ul(insights.priorities)}</ul>
            </div>
          </div>

          <div class="aar-section aar-actions">
            <div class="aar-section-title">📋 Action Plan</div>
            <ol>${insights.actions.map(a => `<li>${a}</li>`).join('')}</ol>
          </div>
        </div>`;
    }).join('');

    container.innerHTML = `
      <div style="margin-top:1.5rem" id="aar-report-body">
        <div class="aar-report-topbar">
          <div>
            <div class="aar-report-title">All Agents Communication Report</div>
            <div class="aar-report-sub">Generated on ${today} &nbsp;·&nbsp; Modules: Pick &amp; Speak · Mock Call / Ticket · Grammar · Listening &nbsp;·&nbsp; Mock Call / Ticket scores shown as AI scores where admin has not yet scored</div>
          </div>
          <button class="btn-secondary aar-print-btn" onclick="window.print()">🖨 Print / Save PDF</button>
        </div>

        <div class="card" style="overflow-x:auto;margin-bottom:1.5rem">
          <table class="data-table" style="min-width:560px">
            <thead>
              <tr>
                <th>Agent</th>
                <th style="text-align:center">Pick &amp; Speak</th>
                <th style="text-align:center">Mock Call / Ticket</th>
                <th style="text-align:center">Grammar</th>
                <th style="text-align:center">Listening</th>
                <th style="text-align:center">Overall</th>
              </tr>
            </thead>
            <tbody>${summaryRows}</tbody>
          </table>
        </div>

        ${cards}
      </div>`;
    container.classList.remove('hidden');
  }

  // ---- Entry point ----
  async function generateAllAgentsReport() {
    const btn = $('btn-all-agents-report');
    if (btn) { btn.disabled = true; btn.textContent = '⌛ Generating…'; }
    try {
      const [trainees, sessions] = await Promise.all([DB.getAll('trainees'), DB.getAll('sessions')]);
      const TARGET = new Set(['pick-speak', 'pick-speak-general', 'pick-speak-stock', 'mock-call', 'grammar-assessment', 'listening-assessment']);

      const agentRows = trainees
        .filter(t => sessions.some(s => s.traineeId === t.id && TARGET.has(s.module)))
        .map(trainee => {
          const { scores, details, overall } = computeAgentScores(trainee.id, sessions);
          const insights = buildAgentInsights(scores, details);
          return { trainee, scores, overall, insights };
        })
        .sort((a, b) => (b.overall ?? -1) - (a.overall ?? -1)); // best performers first

      renderAllAgentsReport(agentRows);
    } catch (e) {
      console.error('generateAllAgentsReport error:', e);
      toast('Could not generate report: ' + e.message, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Generate Report'; }
    }
  }

  // ================================================================
  // ================================================================
  //  MANAGER → AGENT MAP  (28 managers, 326 agents from Excel)
  // ================================================================
  // Updated v37: Harish Bhat D removed; Leepha Joseph added; all teams updated per new Excel
  const _MANAGER_AGENT_MAP = {
    // ── Call Team ──
    "Shalini H S":        ["Manigandan","Swati Sharma","Himanshu Singh Rawat","Surya Hendry","Ashish Yadav","Jayanthi Maniram","Tulsi Shankar Solanki","Adwait Keshavraj Gondkar","Javed Umar Masute","Aimen Nasardi"],
    "Sadique Raza":       ["Priya Singh","Rashid Firoz Ahmed Ansari","Salman Batliwala","Amit Sharma Rajeshwar","Naved Abdul Latif Qureshi","Vishal Shivsahay Singh","Shweta Anil Tiwari","Chitra Mulchand Raghani","Irfan Mustafa Shaikh","Pragya Agrawal"],
    "Vignesh Baliga":     ["Abdul Razak","Himanshu Narula","Ankit","Love Preet Singh","Shivanagoud Huvanagoud Ninganagoudar","Mohit Sharma","Avinash Bhagwanrao Pawde","Diksha U Rane","Vijay Kumar N","K G Saroj","Ayachi Mishra"],
    "Harish V":           ["Naveenkumar Ayyangoudar","Indranil Bose","Seema K S","Anupama H","Stavan Bhardwaj","Ankit Raj","N S Sindhu","Shefali Tyagi","D Karthik"],
    "Sandhya N R":        ["Saneeth T S","Aditya Anil Korde","Shahrukh Shaikh","Rajat Gupta","Bhagesh paithankar","Akash Kumar Singh","Bhavna Deepak Porwal","Bana Gari Naresh Kumar","Mahesh Mohan Prabhu","Gorak Vani"],
    "Shashin Birha":      ["Haritha K","Umang Jain","Rahul Ranjan Roy","Vansh Arora","Deepika S","Muthu Anusuya P","Aman Sharma","Vickey Sharma","Sahib Singh","M Sunny","Nishikant Tiwari","Chetan Patil"],
    "Ritesh S":           ["Nikhil V Durgude","Swetha A","Shruthi K B","Sachita G Harihar","Adnan Sahil S","Mohammed Jabeer Khan","Aryaman M Math","Heeral Sonagare","Maddu Vidya","Srusti Vishnukant Ladda"],
    "Priyanka Sahani":    ["Priyanshu Gupta","Vinayak Kini","Benjamin Anand Mitra","Namreen I Bombaywale","Deva Sahaya Rubia","Geetha Bhandari","Shaheen Ismail Dhaliet","Sourav Basotia","Ashok Sunar","Anjali Gupta"],
    "Nandish S":          ["M Keshava Naik","Shankar Kumar","Alihussain Basha Hyatkhan","Suma Manjunath Tumbraguddi","Suresh Kumar Sahoo","Abhishek Tenginkai","Ambaldhage Vinay Kumar","Lilesh Bhaskar Sapaliga","Anand Jaiswal","Kamalpreet Kour"],
    "Roopashri S":        ["Ashish Thakur","Sougata Das","Arun Kumar M","Malay Pathak","Ananth Sai Sharma","Mrinal Sarkar","Apurva Tyagi","Deepak Kumar","Vachhiyat Dev","Anirudh M Gokhale","Renuka P D"],
    "Pradeep Kumar V":    ["Anil kumara M","Sourabh Singha","Amit Khatri","Yadhu Raman","Premkumar Shivappa Kumbar","Supriti Sinha","Sushree Sangita Santi","Soumya Das","Chandru B","Ankita Bharat Kabra","Govind Goel","Neha Chugh","Anchal Ratan Isaac"],
    "Ankit Singh":        ["Priyanka Singh","Bhanuprakash","Mohan Bhumayya Sabban","MD Tahur","Vaishali B","Shekhar Suman","Ranjitha K","Naheet Parwin","Bhagyashree","Jatin Sharma","Megham Sai Srinivas","Pawan Rajesh Bohra","Sakshi Suryakant Pawar","Vipul Devendra Manek","Koushik C"],
    "Harsha Kumar":       ["Vikram R","Nikhil Raveendran","Mahesh H","Charitha N","Subhashree Das","Amrita Meher","Renuka Devi C","Tapasi Gayen","Praveen Kumar J H","Raghu R","Rashmi Sachin Desai","Akilkumar"],
    "Munish Kumar":       ["Sweta Soni","Aswin Prasad","Nitesh Kumar","Neeti Toppo","Suman Adithya Rao","Venkatesh Barad","Simran Gabrial Masih","Vipul Jain","Dipanwita Saha","Sayantan Bhattacharyya","Ganesh T","Ganesh Thiagarajan","Riya Goyal","Anubhav Nepal","Sanjay S","Sanjay Suresh","Ashish Jyoti Bora"],
    "Shweta":             ["Kumar M G","Ishan Dhadwal","K Prakash Rao","Akhil M A","Sharique Shahid Ansari","Shridhar","Shweta Chauhan","Ajmal Rahim","Jyoti Umesh Sulgekar","Ravishankar Mohan Cherukupalli","Jaideep Singh","Neethu Paulose","Irfan Pasha S"],
    "Anoop Bharat Japtap":["Rajashekharayya Salimath","Nayan Hosur","Ashwinkumar A Shet","Rohan Ajit Kokane","Amit Mahantesh Baligar","Vikas Koti","Adnan Parvezahmed Darga","Sujay Sanjeev Satpute","Amardeep Narayan Baswa","Ankush Ajay Chougule","Abdulsamad Riyazahmed Jamadar","Rakesh Guddadmani","Prajwal"],
    "Sharuq Fayaz Shaikh":["Rakesh Naik","Shabaaz Babajan Shaikh","Yalleshi Mareppa Holennavar","Faisal Javed Shaikh","Nauseen Asif Nargund","Vaibhavi Vinod Balse","Nisha Shankar Kurubar","Anupam Premanand Vernekar","Vishal Vijay Chavan","Nitin Namdev Ningannavar","Faizan Mohammed Ismail Rangrez","Shubham Oza","Rohit Rajeshkumar Patil","Nehal Ravindra Kallimani","Juned Peerjade","Wagesh Gopal Jadhav","Shubham Sambhaji Bhadvankar"],
    "Viraj Raikar":       ["Mohammed Younus C A","Nikhil Subhash Chavan","Gautam Shah","Sneahaal Mulaawadmath","Saivishal Vinod Balse","Pravin Gajanan Ternikar","Nagaratna Mahantesh Marihal","Aaqib Beerwala","Nagesh Pednekar","Suraj Praveen Motimath","Amit Goudadi","Anuj Ajay Chougule"],
    "Nikita Sachin Desai":["Sumanth Kumar Sahu","Amulya K","Anup Sadanandan","Maya M Pillai","Rohan Jain","Mehul Harihar Dhande","Vivek Kumar Verma","Prathvik Saldanha","Jay Prakash Singh","Ravikumar Mangilal Shah","Tabassum Sharieff"],
    "Priyanka Dash":      ["Sadiya Banu","Sangeetha P","Regan Lobo","Sarfaraj Najeer Kudachee","Naman Prakash Awasthi","Prateek Manvi","Amar Vishwakarma","Shivanjali Kumari","M Vinod","Shaktiprasad Bentur","Vivek G K","Shashidhara L"],
    "Leepha Joseph":      ["Chittimani Bhaviteja","Arpitha L K","M Nikhil","Shruti Jain","Joel K Joy","Amritpal Singh","Rugved Sambhajirao Yadav","Rugved Yadav","Rakesh S Sankangoudar","Abhimanyu","Deepak B Nair"],
    "Pratyaksha":         [],
    // ── Ticket Team ──
    "Renuka Mishra":      ["Gonegondla Karanam Venkata Karthik","Adarsh Singh Gautam","Girish A","Saqlain Khalique Shaikh","M Kiran","Keyur P Shah","Ankita Das","Mohd Altaf Bhutta"],
    "Basavaraj Gurav":    ["Shrikanth K","Srawani Deka Basumatary","Vishvajeet Singh","Harshvardhan Singh Rathore","Pratik P Bontra","Rajan Kiran Wagh","Vipul Prakash Sande"],
    "Ratanjeet Maharaj":  ["Roshan KM","Shashank Verma","Martin Davis","Shrutika Sumit Jain","Fiza Kouser","Tejas K Madeval","Khushpreet Kaur","Priyank Sharma"],
    "Girish A":           ["Vansh Agarwal", "Dnyanesh JItendra Badgujar", "Dnyanesh Badgujar", "Sayed Maaz Pasha Inamdar", "Dhruvanandana", "Javeriya Burhanuddin Kittur", "Shivani N Shetty", "Dhanraj", "Mehul Chandtrakant Shetty", "Varun", "Arati Hajgulkar"],
    "Gopi Kiran":         ["Masooma Yousuf","Nitin Tanajirao Pimpalpalle","S Mohammed Akhil","Ankit Agarwal","Murgendra Rajashekhar Patil","Mary Salins","Aldrich Frewin Dsouza"],
    "Shwethayini":        ["Sridevi K V","Suman Janghel","Chandan Kumar","Rahul Kumar","Ravi Kumar Deo","Vishal Bhattar","Rohini Kumari","Nikhil Murlidhar Bhatkar","Mutyala Dinesh"],
    "Swanand Dixit":      ["Deepanshi Lalwani","Roshni","Mayank Lodha","Alamgir Haque","Karthik R","Sachinkumar Ghanti B","Bharat Halagalimath"]
  };

  // Reverse index: agentName.toLowerCase() → managerName (built lazily)
  // Alias variants (e.g. "naveenkumar") are baked in at build time so lookups are direct O(1) hits.
  function _buildAgentManagerIndex() {
    const idx = {};
    const alnum = s => s.replace(/[^a-z0-9]/g, '');

    // Primary: all canonical names from the map
    for (const [mgr, agents] of Object.entries(_MANAGER_AGENT_MAP)) {
      for (const agent of agents) {
        const k = agent.toLowerCase();
        idx[k] = mgr;
        idx[k.replace(/\s+/g, '')] = mgr;   // compact variant
        idx[alnum(k)]               = mgr;   // alnum variant
      }
    }

    // Aliases: bake every DB-name variant directly into the index
    for (const [aliasLower, canonical] of Object.entries(_TRAINEE_ALIASES)) {
      const canonicalKey = canonical.toLowerCase();
      const mgr = idx[canonicalKey] || idx[canonicalKey.replace(/\s+/g,'')] || idx[alnum(canonicalKey)];
      if (mgr) {
        idx[aliasLower] = mgr;
        idx[aliasLower.replace(/\s+/g, '')] = mgr;
        idx[alnum(aliasLower)]               = mgr;
      }
    }
    return idx;
  }

  function _getAgentManager(name) {
    if (!_agentManagerIndex) _agentManagerIndex = _buildAgentManagerIndex();
    if (!name) return null;
    const key   = name.trim().toLowerCase();
    const alnum = s => s.replace(/[^a-z0-9]/g, '');
    return _agentManagerIndex[key]
        || _agentManagerIndex[key.replace(/\s+/g, '')]
        || _agentManagerIndex[alnum(key)]
        || null;
  }

  // ================================================================
  //  ASSESSMENTS — ARCHIVE / MULTI-SELECT
  // ================================================================

  function _refreshArchiveCounts(sessions) {
    const activeCount   = sessions.filter(s => !_archivedIds.has(s.id)).length;
    const archiveCount  = sessions.filter(s =>  _archivedIds.has(s.id)).length;
    const activeSpan    = $('count-active-sessions');
    const archiveSpan   = $('count-archive-sessions');
    if (activeSpan)  activeSpan.textContent  = activeCount  ? `(${activeCount})`  : '';
    if (archiveSpan) archiveSpan.textContent = archiveCount ? `(${archiveCount})` : '';
  }

  function _updateSessionActionBtns() {
    const n       = _selectedSessionIds.size;
    const archBtn = $('btn-archive-selected');
    const restBtn = $('btn-restore-selected');
    if (!archBtn || !restBtn) return;
    if (_viewArchive) {
      archBtn.style.display = 'none';
      restBtn.style.display = '';
      restBtn.disabled      = n === 0;
      restBtn.textContent   = n > 0 ? `↩ Restore Selected (${n})` : '↩ Restore Selected';
    } else {
      restBtn.style.display = 'none';
      archBtn.style.display = '';
      archBtn.disabled      = n === 0;
      archBtn.textContent   = n > 0 ? `📁 Archive Selected (${n})` : '📁 Archive Selected';
    }
  }

  function switchAssessmentView(showArchive) {
    _viewArchive = showArchive;
    _currentManagerDrill = null; // always reset drill when switching tabs
    _selectedSessionIds.clear();
    const backBtn = $('btn-back-to-managers');
    if (backBtn) backBtn.style.display = 'none';
    const mgrSel = $('filter-manager');
    if (mgrSel) mgrSel.value = '';
    // Update tab styling
    const activeTab   = $('tab-active-sessions');
    const archiveTab  = $('tab-archive-sessions');
    if (activeTab)  activeTab.classList.toggle('active',  !showArchive);
    if (archiveTab) archiveTab.classList.toggle('active',  showArchive);
    _updateSessionActionBtns();
    applyAssessmentFilters(_cachedSessions, _cachedTopicMap);
  }

  function toggleSessionCheckbox(id, checked) {
    if (checked) _selectedSessionIds.add(id);
    else         _selectedSessionIds.delete(id);
    _updateSessionActionBtns();
    const allCb = $('select-all-sessions');
    if (allCb && _allRenderedSessions.length > 0) {
      const n = _selectedSessionIds.size;
      allCb.indeterminate = n > 0 && n < _allRenderedSessions.length;
      allCb.checked       = n === _allRenderedSessions.length;
    }
  }

  function toggleAllSessions(checked) {
    _selectedSessionIds.clear();
    if (checked) _allRenderedSessions.forEach(s => _selectedSessionIds.add(s.id));
    document.querySelectorAll('.session-cb').forEach(cb => { cb.checked = checked; });
    _updateSessionActionBtns();
  }

  // Load archived session IDs from the settings table (no schema change required)
  async function _loadArchivedIds() {
    try {
      const rec = await DB.get('settings', 'archivedSessionIds');
      _archivedIds = new Set(rec ? JSON.parse(rec.value) : []);
    } catch (e) {
      _archivedIds = new Set();
    }
  }

  async function _saveArchivedIds() {
    await DB.put('settings', { key: 'archivedSessionIds', value: JSON.stringify([..._archivedIds]) });
  }

  async function _setSessionsArchived(ids, archive) {
    if (archive) {
      ids.forEach(id => _archivedIds.add(id));
    } else {
      ids.forEach(id => _archivedIds.delete(id));
    }
    await _saveArchivedIds();
    _refreshArchiveCounts(_cachedSessions);
    _selectedSessionIds.clear();
    applyAssessmentFilters(_cachedSessions, _cachedTopicMap);
    await updatePendingBadge();
  }

  // ---- Load (or reload) the Assessments tab's data from the DB ----
  // THIS WAS MISSING ENTIRELY: every call site below (including the one in
  // _setSessionsArchived() just above, and the rescore/reset/delete flows
  // further down) called loadAssessments() assuming it existed, but no such
  // function was ever defined — a ReferenceError on every call, always
  // silently caught further up the stack. Because of that, _cachedSessions
  // and _cachedTopicMap (declared near the top of this file) were NEVER
  // populated with real data, so the Assessments tab always rendered "No
  // assessments found," no matter what had actually been submitted — for
  // every module, not just the new Ops Escalation ones. This is what was
  // making a trainee's submitted call invisible in the admin panel.
  // Dashboard was pure static markup with an id on every stat/list element
  // but nothing anywhere ever populated them (no loadDashboard-style
  // function existed at all) -- so it always showed 0/0/0/— and "No
  // sessions yet" regardless of real activity. Pulls from the same
  // DB.getAll('sessions')/('trainees') every other section already uses,
  // across BOTH trainee and manager sessions (unlike _cachedSessions/
  // _mgrSessions, which are each deliberately scoped to one or the other).
  async function loadDashboard() {
    try {
      const [trainees, sessions] = await Promise.all([DB.getAll('trainees'), DB.getAll('sessions')]);

      const setText = (id, val) => { const el = $(id); if (el) el.textContent = val; };
      setText('stat-trainees', trainees.length);
      setText('stat-sessions', sessions.length);
      setText('stat-pending', sessions.filter(s => !s.adminScores).length);

      const scored = sessions.filter(s => s.adminScores);
      const avgAdmin = scored.length
        ? (scored.reduce((acc, s) => acc + (calcAdminAvg(s.adminScores) || 0), 0) / scored.length).toFixed(1)
        : null;
      setText('stat-avg-score', avgAdmin != null ? avgAdmin + '%' : '—');

      // Sessions by module -- a simple bar chart, matching the
      // .module-bar-row/.module-bar-track/.module-bar-fill markup the CSS
      // already expects but nothing ever rendered.
      const byModule = {};
      sessions.forEach(s => { const m = s.module || 'unknown'; byModule[m] = (byModule[m] || 0) + 1; });
      const entries = Object.entries(byModule).sort((a, b) => b[1] - a[1]);
      const maxCount = entries.length ? entries[0][1] : 0;
      const moduleBreakdownEl = $('module-breakdown');
      if (moduleBreakdownEl) {
        moduleBreakdownEl.innerHTML = entries.length
          ? entries.map(([m, c]) => `
            <div class="module-bar-row">
              <span class="module-bar-label">${MODULE_LABELS[m] || m}</span>
              <div class="module-bar-track"><div class="module-bar-fill" style="width:${maxCount ? (c / maxCount * 100) : 0}%;background:${MODULE_COLORS[m] || 'var(--primary)'}"></div></div>
              <span class="module-bar-count">${c}</span>
            </div>`).join('')
          : '<div class="empty-state" style="padding:1rem">No sessions yet.</div>';
      }

      // Recent activity -- last 10 submissions across everyone
      const recentEl = $('recent-activity');
      if (recentEl) {
        const recent = sessions
          .filter(s => s.submittedAt)
          .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt))
          .slice(0, 10);
        recentEl.innerHTML = recent.length
          ? recent.map(s => `
            <div class="activity-item">
              <span class="activity-dot" style="background:${MODULE_COLORS[s.module] || 'var(--primary)'}"></span>
              <span class="activity-text"><strong>${s.traineeName || 'Unknown'}</strong> completed ${MODULE_LABELS[s.module] || s.module}</span>
              <span class="activity-time">${formatDate(s.submittedAt)}</span>
            </div>`).join('')
          : '<div class="empty-state" style="padding:1rem">No recent activity.</div>';
      }
    } catch (e) {
      console.error('loadDashboard error:', e);
    }
  }

  async function loadAssessments() {
    try {
      await _loadArchivedIds(); // also never wired up before now
      const [sessions, topics] = await Promise.all([
        DB.getAll('sessions'),
        DB.getAll('topics')
      ]);
      _cachedTopicMap = {};
      topics.forEach(t => { _cachedTopicMap[t.id] = t; });
      // Manager assessments (module starts with 'mgr-') have their own
      // dedicated "Manager Assessments" tab/table (_mgrSessions, below) --
      // matchesModuleFilter() previously let them pass through the trainee
      // Assessments tab's "All Modules" filter too, so a manager's completed
      // assessment would show up here mixed in with trainee sessions, and
      // would also inflate/skew the Active/Archive and Pending Review counts.
      // Excluded at the source so every count and view derived from
      // _cachedSessions is trainee-only.
      _cachedSessions = sessions.filter(s => !(s.module && s.module.startsWith('mgr-')));
      _refreshArchiveCounts(_cachedSessions);
      applyAssessmentFilters(_cachedSessions, _cachedTopicMap);
      await updatePendingBadge();
    } catch (e) {
      console.error('loadAssessments failed:', e);
      const tbody = $('assessments-tbody');
      if (tbody) tbody.innerHTML = `<tr><td colspan="7" class="empty-state">Failed to load assessments: ${e.message}</td></tr>`;
    }
  }

  // ---- Pending-review count badge on the Assessments nav item ----
  // Also previously missing (see loadAssessments() note above) — every
  // caller assumed it existed.
  async function updatePendingBadge() {
    const pending = _cachedSessions.filter(s => !s.adminScores && !_archivedIds.has(s.id)).length;
    const badge = document.getElementById('pending-badge');
    if (badge) badge.textContent = pending > 0 ? String(pending) : '0';
  }

  async function archiveSelectedSessions() {
    const ids = [..._selectedSessionIds];
    if (!ids.length) return;
    if (!confirm(`Move ${ids.length} assessment${ids.length !== 1 ? 's' : ''} to Archive?\n\nYou can restore them at any time from the Archive tab.`)) return;
    try {
      await _setSessionsArchived(ids, true);
      toast(`${ids.length} assessment${ids.length !== 1 ? 's' : ''} moved to Archive.`, 'success');
    } catch (e) {
      toast('Archive failed: ' + e.message, 'error');
    }
  }

  async function restoreSelectedSessions() {
    const ids = [..._selectedSessionIds];
    if (!ids.length) return;
    if (!confirm(`Restore ${ids.length} assessment${ids.length !== 1 ? 's' : ''} back to Active?`)) return;
    try {
      await _setSessionsArchived(ids, false);
      toast(`${ids.length} assessment${ids.length !== 1 ? 's' : ''} restored to Active.`, 'success');
    } catch (e) {
      toast('Restore failed: ' + e.message, 'error');
    }
  }

  async function archiveSingleSession(id, name) {
    try {
      await _setSessionsArchived([id], true);
      toast(`Archived assessment for ${name}.`, 'success');
    } catch (e) {
      toast('Archive failed: ' + e.message, 'error');
    }
  }

  async function restoreSingleSession(id, name) {
    try {
      await _setSessionsArchived([id], false);
      toast(`Restored assessment for ${name}.`, 'success');
    } catch (e) {
      toast('Restore failed: ' + e.message, 'error');
    }
  }

  // ================================================================
  //  AI AUDIT SCORES SECTION
  //  Data stored in settings table (key: aiAuditScores) — no extra table needed
  // ================================================================

  const _AI_AUDIT_KEY = 'aiAuditScores';
  const _AI_AUDIT_SEED = [{"id":"48ba3d37-765a-4929-9ae5-1a0e67018aba","name":"Manigandan","selfAssessmentScore":7.027,"aiAuditScore":3.91},{"id":"20d684f1-8ce0-4122-95be-bf85f2b4f73c","name":"Swati Sharma","selfAssessmentScore":8.1081,"aiAuditScore":3.87},{"id":"ec0bae65-02aa-4a02-96ea-dbaa676141ec","name":"Himanshu Singh Rawat","selfAssessmentScore":9.0811,"aiAuditScore":3.865},{"id":"ab5e92b0-c8d5-4c0f-94a4-c787653f5e2b","name":"Aldrich Frewin Dsouza","selfAssessmentScore":8.6486,"aiAuditScore":3.8},{"id":"509365e4-4e6d-4947-9846-171c99e781c3","name":"Surya Hendry","selfAssessmentScore":8.3243,"aiAuditScore":0.36},{"id":"3c1544f1-f563-49ee-bed2-7d27c6600542","name":"Mohd Altaf Bhutta","selfAssessmentScore":7.2973,"aiAuditScore":3.945},{"id":"0c9484d1-4fcd-4c9f-98d8-d113fca827ec","name":"Ashish Yadav","selfAssessmentScore":7.2973,"aiAuditScore":3.89},{"id":"eb1c3281-6495-4a96-a835-902197877f80","name":"Jayanthi Maniram","selfAssessmentScore":7.6757,"aiAuditScore":3.965},{"id":"d51480cb-e64c-43b7-9e40-e84c254c5009","name":"Tulsi Shankar Solanki","selfAssessmentScore":8.973,"aiAuditScore":3.925},{"id":"9ff5c6a0-e2dc-4af3-a327-4bea24f3d0d8","name":"Adwait Keshavraj Gondkar","selfAssessmentScore":6.7568,"aiAuditScore":4.05},{"id":"685381a9-c39e-4ad2-903a-4cb588ccb0e1","name":"Javed Umar Masute","selfAssessmentScore":7.6216,"aiAuditScore":4.06},{"id":"bbd14b82-63e5-4afc-a01a-b6dd156124c4","name":"Israel Jaisingh","selfAssessmentScore":7.8378,"aiAuditScore":3.84},{"id":"f30e86f5-790d-4afb-8640-3f7a5e840373","name":"Priya Singh","selfAssessmentScore":9.5676,"aiAuditScore":3.865},{"id":"380e4088-0aec-4de7-8a89-cb816a4311a7","name":"Rashid Firoz Ahmed Ansari","selfAssessmentScore":7.5135,"aiAuditScore":3.55},{"id":"a02ccf01-e93e-4bd2-8d85-dbc7fefbae0d","name":"Salman Batliwala","selfAssessmentScore":6.8108,"aiAuditScore":3.89},{"id":"0d7c7e31-c98d-4aab-8748-ddc6ed4f5e50","name":"Amit Sharma Rajeshwar","selfAssessmentScore":7.4054,"aiAuditScore":3.955},{"id":"6d7845af-4270-4411-a5f3-1c3869a8a143","name":"Naved Abdul Latif Qureshi","selfAssessmentScore":8.7027,"aiAuditScore":3.89},{"id":"e46697d3-f782-4556-b0b4-26142bd6a12c","name":"Vishal Shivsahay Singh","selfAssessmentScore":8.2703,"aiAuditScore":4.005},{"id":"29a09f12-0c97-4b37-b810-9a5f42ae648a","name":"Shweta Anil Tiwari","selfAssessmentScore":6.1081,"aiAuditScore":3.66},{"id":"b3a082ea-0372-4c6d-b6ed-0ff168ae4a32","name":"Chitra Mulchand Raghani","selfAssessmentScore":9.4054,"aiAuditScore":3.885},{"id":"cd88baa1-de3a-466a-a5ef-a22ff524b1cc","name":"Irfan Mustafa Shaikh","selfAssessmentScore":9.6757,"aiAuditScore":3.91},{"id":"692f341b-6151-4ca6-8cab-88c02b3acf02","name":"Pragya Agrawal","selfAssessmentScore":9.2432,"aiAuditScore":3.765},{"id":"d4cc08b6-4468-49c3-a574-d37d3c2d0c74","name":"Abdul Razak","selfAssessmentScore":9.2432,"aiAuditScore":3.945},{"id":"1c5f7579-4fe0-43a1-839f-3501960d17bc","name":"Himanshu Narula","selfAssessmentScore":7.1892,"aiAuditScore":3.865},{"id":"312b7d65-51ff-47e0-8681-5ca1edae26b6","name":"Ankit","selfAssessmentScore":7.4595,"aiAuditScore":3.855},{"id":"7b7315d1-6138-44fd-8293-0873f04d40da","name":"Love Preet Singh","selfAssessmentScore":7.8919,"aiAuditScore":3.705},{"id":"5e530e0b-9997-4fb2-bee0-c4a893cb3803","name":"Shivanagoud Huvanagoud Ninganagoudar","selfAssessmentScore":7.7297,"aiAuditScore":3.92},{"id":"56663fea-2af2-44ee-a709-899b1ecf5cac","name":"Nivedita Mukherjee","selfAssessmentScore":7.4595,"aiAuditScore":3.725},{"id":"911fcc3a-d4cd-4245-8b86-670c1f6f1ba3","name":"Mohit Sharma","selfAssessmentScore":8.3243,"aiAuditScore":4.005},{"id":"388fe495-0ca8-431b-891e-51f4ab08dbbb","name":"Avinash Bhagwanrao Pawde","selfAssessmentScore":6.5405,"aiAuditScore":3.665},{"id":"681fbfd0-14b5-4a80-bda9-3c9a920c9807","name":"Diksha U Rane","selfAssessmentScore":6.4324,"aiAuditScore":3.8},{"id":"b2f73ccf-8f0f-4d6e-8f2d-c7bd8b3895f6","name":"Prashant Tiwari","selfAssessmentScore":0.0,"aiAuditScore":0.0},{"id":"30961a0f-5bfd-448d-b399-3747fd0786dc","name":"Vijay Kumar N","selfAssessmentScore":7.4595,"aiAuditScore":3.765},{"id":"3b666171-89cc-4d40-af03-f0df6bfe91e5","name":"K G Saroj","selfAssessmentScore":6.5405,"aiAuditScore":3.825},{"id":"169469e9-1dde-430a-802f-f3e6125393e9","name":"Ayachi Mishra","selfAssessmentScore":8.7027,"aiAuditScore":3.885},{"id":"5b15de0f-e5d2-4a69-b07a-86d12641acbc","name":"Naveenkumar Ayyangoudar","selfAssessmentScore":7.4595,"aiAuditScore":3.945},{"id":"60024f5a-e582-49ce-ab86-d930bbe5f47c","name":"Indranil Bose","selfAssessmentScore":8.6486,"aiAuditScore":3.965},{"id":"c4b4c12d-f5e2-42ee-84a5-2b620f59b0ce","name":"Seema K S","selfAssessmentScore":9.3514,"aiAuditScore":4.02},{"id":"636248a5-9270-472e-8ba3-f905de1523fd","name":"D Karthik","selfAssessmentScore":9.4054,"aiAuditScore":3.81},{"id":"052b4e8f-3ff9-4088-82a1-e60b22d2096b","name":"Anupama H","selfAssessmentScore":9.5135,"aiAuditScore":4.005},{"id":"4091cd28-3c7b-4fd1-b8c2-fef685751e86","name":"Ankita Das","selfAssessmentScore":9.1351,"aiAuditScore":3.96},{"id":"d4eed1ed-60f9-482b-81c4-968d43572601","name":"Stavan Bhardwaj","selfAssessmentScore":9.1892,"aiAuditScore":4.14},{"id":"69dd759d-37e4-4bf7-be27-e412531dbd7b","name":"Ankit Raj","selfAssessmentScore":9.8378,"aiAuditScore":3.855},{"id":"2f6fa9dd-d125-4a89-b3f0-0fa69e70035c","name":"N S Sindhu","selfAssessmentScore":8.8649,"aiAuditScore":3.855},{"id":"39acb824-705d-4771-9249-e7946886ae33","name":"Shefali Tyagi","selfAssessmentScore":18.5,"aiAuditScore":3.725},{"id":"cc5c7542-b48c-4eac-b21c-e20d3386058e","name":"Saneeth T S","selfAssessmentScore":0.0,"aiAuditScore":0.0},{"id":"f19fc47e-ef0c-4136-80f2-6e6ea919ffa5","name":"Aditya Anil Korde","selfAssessmentScore":15.8,"aiAuditScore":3.805},{"id":"11726dfa-969e-4a1c-baff-855230449a03","name":"Shahrukh Shaikh","selfAssessmentScore":14.7,"aiAuditScore":3.885},{"id":"3e115365-3fba-4144-9f27-d6d1e98c0f99","name":"Gorak Vani","selfAssessmentScore":14.4,"aiAuditScore":3.71},{"id":"98c60454-99b8-49c5-925b-669ee97b10d1","name":"Rajat Gupta","selfAssessmentScore":15.4,"aiAuditScore":3.76},{"id":"2ef1a2d2-542a-41eb-8b87-e76101b62d07","name":"Bhagesh paithankar","selfAssessmentScore":14.1,"aiAuditScore":3.69},{"id":"01810360-e520-4d62-a7dc-03b323ee4a4e","name":"Akash Kumar Singh","selfAssessmentScore":16.0,"aiAuditScore":3.905},{"id":"d7fb38f1-f10d-41b0-8b87-c0aaa51184ed","name":"Bhavna Deepak Porwal","selfAssessmentScore":8.8,"aiAuditScore":3.685},{"id":"826ac9e5-99fe-4d88-9253-66801df033da","name":"Bana Gari Naresh Kumar","selfAssessmentScore":15.9,"aiAuditScore":3.66},{"id":"b2ab2d1d-0401-462a-b759-4f3ceb5d0049","name":"Sritam Prusty","selfAssessmentScore":0.0,"aiAuditScore":0.0},{"id":"69e6646e-4c13-41f4-ba5f-76938f1f963d","name":"Mahesh Mohan Prabhu","selfAssessmentScore":13.9,"aiAuditScore":3.94},{"id":"5ccc85a4-21f4-4698-8588-e5ce6d2f1010","name":"Haritha K","selfAssessmentScore":9.0811,"aiAuditScore":4.1},{"id":"8fa4d34e-65a8-4158-85be-6a8f5a646f8d","name":"Umang Jain","selfAssessmentScore":8.973,"aiAuditScore":3.92},{"id":"2c602f2f-cd89-4a48-b9cc-2ca0ea4bfde5","name":"Rahul Ranjan Roy","selfAssessmentScore":8.2703,"aiAuditScore":3.97},{"id":"cd686e2a-4653-422c-9124-cb4bb712e3bf","name":"Vansh Arora","selfAssessmentScore":8.4865,"aiAuditScore":3.895},{"id":"7c8984f6-96f7-4615-9ac0-4e93c0049796","name":"Deepika S","selfAssessmentScore":9.027,"aiAuditScore":3.825},{"id":"2eddfb2a-a472-40b6-ac88-22ed2cdefa3a","name":"Muthu Anusuya P","selfAssessmentScore":7.7297,"aiAuditScore":3.66},{"id":"e8c53f97-bff7-4473-a55e-3fec6cf14ca9","name":"Aman Sharma","selfAssessmentScore":8.1622,"aiAuditScore":3.585},{"id":"39610dee-9689-48a7-9ddd-bea33d3d09d8","name":"Vickey Sharma","selfAssessmentScore":8.5405,"aiAuditScore":4.03},{"id":"539142d3-cfbe-4ab2-870b-959173e034aa","name":"Sahib Singh","selfAssessmentScore":8.973,"aiAuditScore":3.86},{"id":"30e50f8a-9d43-4512-8cf6-5481e8e83025","name":"M Sunny","selfAssessmentScore":8.4865,"aiAuditScore":3.89},{"id":"b3314c0d-933d-4d79-ae6a-7481e64148e0","name":"Nishikant Tiwari","selfAssessmentScore":8.4324,"aiAuditScore":3.855},{"id":"b71a8bee-b796-42b5-acdc-4715d18ad95b","name":"Chetan Patil","selfAssessmentScore":8.7027,"aiAuditScore":3.98},{"id":"b40c6957-b049-4dee-9fd3-c66f9936d4a6","name":"Nikhil V Durgude","selfAssessmentScore":9.4595,"aiAuditScore":3.92},{"id":"a0180668-7ada-4963-b39b-e4c768fb7318","name":"Swetha A","selfAssessmentScore":9.9459,"aiAuditScore":3.715},{"id":"831d1e0b-bfb6-4dd4-8430-0a022dce1719","name":"Shruthi K B","selfAssessmentScore":9.2973,"aiAuditScore":3.975},{"id":"8f672407-549b-423a-ae87-591646fd93b6","name":"Sachita G Harihar","selfAssessmentScore":9.6757,"aiAuditScore":3.77},{"id":"19e161e3-45eb-48b0-961a-425efb769f13","name":"Adnan Sahil S","selfAssessmentScore":9.5676,"aiAuditScore":4.1},{"id":"53d1c987-d951-4a60-ba31-22bcd848f8b4","name":"Mohammed Jabeer Khan","selfAssessmentScore":9.7838,"aiAuditScore":3.93},{"id":"adda17b7-5bb5-479d-b153-b4c3cf5bcc24","name":"Mutyala Dinesh","selfAssessmentScore":9.0811,"aiAuditScore":3.605},{"id":"fc38dfaf-462b-4f14-984a-027e8b861c0b","name":"Heeral Sonagare","selfAssessmentScore":7.5676,"aiAuditScore":3.72},{"id":"4d4fbc99-8546-4689-9699-ab20a57b1208","name":"Aryaman M Math","selfAssessmentScore":7.027,"aiAuditScore":3.605},{"id":"8d27d8d3-246c-4902-8f3a-1c684db2bee8","name":"Srusti Vishnukant Ladda","selfAssessmentScore":9.7297,"aiAuditScore":3.91},{"id":"fa101fa0-143b-4474-93b7-49c8e629d35d","name":"Maddu Vidya","selfAssessmentScore":6.8649,"aiAuditScore":3.89},{"id":"fa7a1fd8-9122-4bc9-97d7-e819c692907c","name":"Ankit Gupta","selfAssessmentScore":5.8919,"aiAuditScore":3.85},{"id":"c5aff930-a65f-4bb7-97d9-df27f8f000ee","name":"Rohit Anand","selfAssessmentScore":6.1622,"aiAuditScore":4.075},{"id":"da9fbdcb-d05d-40e9-8540-54deb3c2d6bc","name":"Ashish Pandey","selfAssessmentScore":9.0811,"aiAuditScore":3.885},{"id":"d3e64389-e387-4b3a-ab7a-917260614264","name":"Devanand Harinarayan Gupta","selfAssessmentScore":6.2703,"aiAuditScore":3.51},{"id":"f98aacca-27cf-440d-8195-a285215679ed","name":"Jerril Rajan","selfAssessmentScore":8.0,"aiAuditScore":4.06},{"id":"b2e0ed5a-cd83-46d5-add5-5119385989f6","name":"Jayanth Prasad B S","selfAssessmentScore":9.2432,"aiAuditScore":3.525},{"id":"1e0daa92-b237-4a59-8622-e002a6bda51f","name":"Arun P P","selfAssessmentScore":6.6486,"aiAuditScore":3.715},{"id":"4b33963b-e149-4383-b44e-008b50c3a958","name":"Sudhir Kumar Mishra","selfAssessmentScore":7.0811,"aiAuditScore":3.95},{"id":"3c03aa10-1468-4396-b219-da5e6da3892e","name":"Priyanshu Gupta","selfAssessmentScore":8.6486,"aiAuditScore":4.02},{"id":"cdcd4b5e-c316-4df9-8adc-ae33031dcdd5","name":"Vinayak Kini","selfAssessmentScore":9.5676,"aiAuditScore":3.93},{"id":"ae296815-f114-460d-beba-b3fa9993e7f8","name":"Benjamin Anand Mitra","selfAssessmentScore":6.2162,"aiAuditScore":3.98},{"id":"84a1e80b-adb0-4a23-8361-0701d4560e63","name":"Namreen I Bombaywale","selfAssessmentScore":7.6757,"aiAuditScore":3.82},{"id":"fbfd548f-336f-4455-8256-1f9153724c66","name":"Deva Sahaya Rubia","selfAssessmentScore":8.5946,"aiAuditScore":4.08},{"id":"4247cb3c-8bae-4a88-b93c-a5d035ff3019","name":"Geetha Bhandari","selfAssessmentScore":9.2432,"aiAuditScore":3.9},{"id":"30f53f98-cc50-45bc-997c-eeee967dc3ab","name":"Shaheen Ismail Dhaliet","selfAssessmentScore":8.9189,"aiAuditScore":3.91},{"id":"53ff95e2-2a4a-404c-8122-f568706110c7","name":"Sourav Basotia","selfAssessmentScore":8.5946,"aiAuditScore":3.775},{"id":"a1be9ecd-f9f7-4f1b-85d9-252ff9f93ac1","name":"Pratik Poddar","selfAssessmentScore":8.5405,"aiAuditScore":3.82},{"id":"22dd02d6-a0c0-4385-945c-2c8bf8ff1f8a","name":"Ashok Sunar","selfAssessmentScore":8.4324,"aiAuditScore":3.96},{"id":"f955c6a7-bd67-4826-b2d1-6186356061f1","name":"Anjali Gupta","selfAssessmentScore":8.4324,"aiAuditScore":3.735},{"id":"2543d279-f433-4872-9762-e776539ffad5","name":"M Keshava Naik","selfAssessmentScore":9.1892,"aiAuditScore":3.845},{"id":"3e894934-5817-49ed-b23b-97288b6e3e41","name":"Shankar Kumar","selfAssessmentScore":8.0541,"aiAuditScore":3.705},{"id":"d5ab17df-e8b6-40ca-ab64-084415ba8ce5","name":"Alihussain Basha Hyatkhan","selfAssessmentScore":7.6216,"aiAuditScore":3.925},{"id":"9e78616a-2e0d-4abb-a9b2-918101c933ea","name":"Suma Manjunath Tumbraguddi","selfAssessmentScore":9.0811,"aiAuditScore":3.965},{"id":"65f60033-31c8-437a-bf4b-efe5dbf98117","name":"Suresh Kumar Sahoo","selfAssessmentScore":9.6216,"aiAuditScore":3.905},{"id":"a98d54e8-9ce3-4762-bd50-627c886497d9","name":"Abhishek Tenginkai","selfAssessmentScore":8.0,"aiAuditScore":3.58},{"id":"d96a3c56-cda8-4044-a848-e976a0bd6330","name":"Ambaldhage Vinay Kumar","selfAssessmentScore":7.3514,"aiAuditScore":4.08},{"id":"b5cde1c8-a7d6-414e-9b28-2c0bc95dced9","name":"Lilesh Bhaskar Sapaliga","selfAssessmentScore":9.5135,"aiAuditScore":3.795},{"id":"eea5505d-6a38-45c2-9374-0ac1abe28b21","name":"Anand Jaiswal","selfAssessmentScore":8.4324,"aiAuditScore":3.765},{"id":"dd7a37b5-b768-4404-910d-bbb780c811d0","name":"Kamalpreet Kour","selfAssessmentScore":0.0,"aiAuditScore":0.0},{"id":"d22d1092-8b79-4d39-a4d7-d3535b5e3eee","name":"Ashish Thakur","selfAssessmentScore":8.5946,"aiAuditScore":3.91},{"id":"2571c59e-6dad-4b4a-97f8-41b56e4c17c1","name":"B H Srinivas Pai","selfAssessmentScore":0.0,"aiAuditScore":0.0},{"id":"1de57bc2-ce8b-43ac-905f-a1a377ac8770","name":"Sougata Das","selfAssessmentScore":7.027,"aiAuditScore":3.9},{"id":"56de0a91-86a0-4cbb-8f32-8bfdd6ced51e","name":"Arun Kumar M","selfAssessmentScore":8.7568,"aiAuditScore":3.935},{"id":"62124987-6b77-421d-91a3-9d68dfe6b2d3","name":"Rohit Basavaraj Uppin","selfAssessmentScore":0.0,"aiAuditScore":0.0},{"id":"874745bb-54ea-41bc-8356-5f38aa1ed010","name":"Malay Pathak","selfAssessmentScore":8.3784,"aiAuditScore":4.875},{"id":"84fd5a61-3f45-467b-94c4-ed9809dbb291","name":"Ananth Sai Sharma","selfAssessmentScore":8.0541,"aiAuditScore":3.825},{"id":"46ea061e-e50c-40da-8488-e2f0102669be","name":"Madhusudan R","selfAssessmentScore":0.0,"aiAuditScore":0.0},{"id":"2d4192bc-ddf9-4f8e-a084-cdb0ebfda2e8","name":"Mrinal Sarkar","selfAssessmentScore":8.8108,"aiAuditScore":3.97},{"id":"0b7b51ed-af66-4fcc-ab79-752d3dec7b1a","name":"Apurva Tyagi","selfAssessmentScore":8.973,"aiAuditScore":3.29},{"id":"dc85870b-f48e-47b0-9455-07adb76d4ff8","name":"Anirudh","selfAssessmentScore":null,"aiAuditScore":null},{"id":"1a471d7f-64d8-428f-b8eb-5a98d7066b6f","name":"Dev","selfAssessmentScore":null,"aiAuditScore":null},{"id":"e879beda-c686-43ff-865a-0e36e4eceeb9","name":"Deepak Kumar","selfAssessmentScore":8.4324,"aiAuditScore":3.27},{"id":"b3bb3af3-ad2a-4c33-9acb-eb40bfb1f59a","name":"Anchal Ratan Isaac","selfAssessmentScore":7.1892,"aiAuditScore":4.085},{"id":"713b45bf-864e-4997-8a89-42af5324d3ec","name":"Irfan Pasha S","selfAssessmentScore":6.0,"aiAuditScore":3.825},{"id":"6a053322-e504-4d81-83b6-a3a81d56e540","name":"Akilkumar","selfAssessmentScore":6.1081,"aiAuditScore":3.885},{"id":"eed3a599-d541-458a-b0ce-c55882cc1559","name":"Ashish Jyoti Bora","selfAssessmentScore":9.3514,"aiAuditScore":4.0},{"id":"b25167a0-bcab-4f66-acbe-cd48baa2e5bb","name":"Koushik C","selfAssessmentScore":7.1892,"aiAuditScore":4.125},{"id":"80b4c310-ec18-4b66-b288-d943126e068d","name":"Tabassum Sharieff","selfAssessmentScore":null,"aiAuditScore":3.975},{"id":"53394abd-eebe-453e-9180-61a02b45c034","name":"Govind Goel","selfAssessmentScore":5.8378,"aiAuditScore":3.825},{"id":"99ed1a6c-3c3b-4ff7-a0c3-a2cf17925b82","name":"Neha Chugh","selfAssessmentScore":7.5676,"aiAuditScore":3.895},{"id":"34b9cd84-7563-482c-a6a9-63833bcc5bba","name":"Anubhav Nepal","selfAssessmentScore":7.8378,"aiAuditScore":4.025},{"id":"7639c4b8-fd8f-49fb-9bbf-72d767cf7454","name":"Sanjay S","selfAssessmentScore":8.0,"aiAuditScore":3.895},{"id":"a809d0fd-e4da-4c44-a83d-a1710b76e240","name":"Shashidhara L","selfAssessmentScore":7.5135,"aiAuditScore":4.0},{"id":"8e918761-3122-4209-ae4e-636225724a4e","name":"Abhimanyu","selfAssessmentScore":7.4054,"aiAuditScore":3.91},{"id":"5487cad9-ddc4-4674-8587-01253312c2b0","name":"Deepak B Nair","selfAssessmentScore":7.1892,"aiAuditScore":3.82},{"id":"f9176f5a-2c01-4f05-a9ab-ba1a12283eb8","name":"Shruti Jain","selfAssessmentScore":8.3784,"aiAuditScore":3.65},{"id":"c64137cb-6bb4-47cc-a0fd-dcfb0a7ff62c","name":"Joel K Joy","selfAssessmentScore":9.4595,"aiAuditScore":3.905},{"id":"51981df1-246f-440f-8d73-ac9786b432fe","name":"Anil kumara M","selfAssessmentScore":7.3514,"aiAuditScore":3.995},{"id":"a6af131e-dc3a-4b16-8964-c188bf240217","name":"Sourabh Singha","selfAssessmentScore":7.5135,"aiAuditScore":3.91},{"id":"746f3fa5-cebd-4f47-93ee-a1c647fdc35c","name":"Amit Khatri","selfAssessmentScore":7.027,"aiAuditScore":3.955},{"id":"2471d0cb-3f15-4ee8-804b-4225cfd7b632","name":"Yadhu Raman","selfAssessmentScore":8.2162,"aiAuditScore":3.87},{"id":"cc1dcacd-f7be-4eb3-83da-6271c9523ec5","name":"Premkumar Shivappa Kumbar","selfAssessmentScore":8.7568,"aiAuditScore":3.825},{"id":"153f58b0-a10e-4b5b-b3eb-9a9f79599ece","name":"Prasidhi Kamal Rathi","selfAssessmentScore":0.0,"aiAuditScore":0.0},{"id":"a4ac5e9b-30fc-423d-b982-ebdc2922d221","name":"Supriti Sinha","selfAssessmentScore":7.6216,"aiAuditScore":3.9},{"id":"873c7861-8bb8-493a-8670-fa1f1f7b8ae5","name":"Sushree Sangita Santi","selfAssessmentScore":9.2973,"aiAuditScore":3.84},{"id":"27321136-0c0f-47b3-af4b-447d31941191","name":"Syeda Tayaba","selfAssessmentScore":0.0,"aiAuditScore":0.0},{"id":"319346f3-d76a-4034-97c3-dbd1fd706e59","name":"Soumya Das","selfAssessmentScore":8.0541,"aiAuditScore":3.975},{"id":"bce1d6c4-afd7-4716-b756-d223ac9ce9c8","name":"Chandru B","selfAssessmentScore":9.6757,"aiAuditScore":3.85},{"id":"c4e1cf6f-3b8c-4236-9285-1b3515910518","name":"Ankita Bharat Kabra","selfAssessmentScore":7.6757,"aiAuditScore":3.86},{"id":"d9a09fe7-9c58-403e-b2af-c954c2c0ef37","name":"Priyanka Singh","selfAssessmentScore":6.7568,"aiAuditScore":3.875},{"id":"a1d510f9-b498-4b64-9540-712bd378c0a2","name":"Bhanuprakash","selfAssessmentScore":8.0,"aiAuditScore":3.825},{"id":"8e612689-cb3b-4eae-af0e-68faa0693965","name":"Mohan Bhumayya Sabban","selfAssessmentScore":8.0,"aiAuditScore":3.795},{"id":"f8edea13-ad66-4359-b487-2c3beb6849da","name":"MD Tahur","selfAssessmentScore":7.3514,"aiAuditScore":3.93},{"id":"50f2f892-8a03-4788-8d00-443a2ce64112","name":"Vaishali B","selfAssessmentScore":7.4054,"aiAuditScore":3.685},{"id":"46a84e27-246a-4b61-b388-66f5f063e777","name":"Shekhar Suman","selfAssessmentScore":7.3514,"aiAuditScore":4.0},{"id":"857db4ca-b50f-4e50-9b29-10762f3489aa","name":"Ranjitha K","selfAssessmentScore":7.1351,"aiAuditScore":3.915},{"id":"4960e49e-82f6-440e-9bb0-e7464d6ffe4b","name":"Harsh Mahesh Upadhyay","selfAssessmentScore":9.1892,"aiAuditScore":4.065},{"id":"19c2ea52-0a55-42b2-8c5b-21f95b230872","name":"Naheet Parwin","selfAssessmentScore":8.0,"aiAuditScore":3.815},{"id":"dbcb5992-9d20-401e-b075-bcd552b521bd","name":"Bhagyashree","selfAssessmentScore":9.2432,"aiAuditScore":3.88},{"id":"afe0bb41-af86-44d8-bad6-87f6ea995966","name":"Jatin Sharma","selfAssessmentScore":7.2973,"aiAuditScore":3.89},{"id":"b71c1f04-3115-41ac-9a92-88f87a303bcc","name":"Megham Sai Srinivas","selfAssessmentScore":7.3514,"aiAuditScore":3.97},{"id":"5cb20437-b1b9-40bc-bcec-c8205af9cd82","name":"Pawan Rajesh Bohra","selfAssessmentScore":7.5135,"aiAuditScore":3.19},{"id":"6328ccb9-efc3-4951-ba21-e0258918c89e","name":"Sakshi Suryakant Pawar","selfAssessmentScore":7.6757,"aiAuditScore":3.96},{"id":"648b743b-893a-47e7-b9ee-4d9a0d183200","name":"Vipul Devendra Manek","selfAssessmentScore":8.2162,"aiAuditScore":3.96},{"id":"dbec161f-bfcf-4501-a9e0-8732ea602d79","name":"Vikram R","selfAssessmentScore":8.973,"aiAuditScore":3.845},{"id":"e3059587-c5d3-4da9-9e90-7a43a4847c60","name":"Nikhil Raveendran","selfAssessmentScore":6.1622,"aiAuditScore":3.85},{"id":"9fefad87-d757-4c8f-80d2-a359210a267e","name":"Mahesh H","selfAssessmentScore":8.7568,"aiAuditScore":3.89},{"id":"7fd55466-2bf4-4681-8191-ef0649c37964","name":"Charitha N","selfAssessmentScore":8.4324,"aiAuditScore":4.07},{"id":"e7436ed4-c34f-4163-b4cd-038fea5a4d26","name":"Subhashree Das","selfAssessmentScore":8.0,"aiAuditScore":3.925},{"id":"305ad089-0ee7-425c-b4b9-9bd2e71ad663","name":"Nishant Pareek","selfAssessmentScore":7.1892,"aiAuditScore":4.045},{"id":"667c32b2-3344-4422-a88b-671ce8ef940a","name":"Krupa N","selfAssessmentScore":8.2162,"aiAuditScore":3.86},{"id":"c4154076-3cb6-4dd1-a3eb-19dc5a74e189","name":"Amrita Meher","selfAssessmentScore":7.027,"aiAuditScore":3.81},{"id":"c51eb2fd-0ace-4555-be50-d996805fe254","name":"Aryasomayajula Lakshmi Tejaswi","selfAssessmentScore":0.0,"aiAuditScore":0.0},{"id":"68407d4b-07d8-4b61-ac8b-77c9dce27798","name":"Renuka Devi C","selfAssessmentScore":7.7838,"aiAuditScore":3.75},{"id":"f98819b4-0062-4ccc-8c38-58b829fa1297","name":"Tapasi Gayen","selfAssessmentScore":7.1351,"aiAuditScore":3.93},{"id":"98076472-78fc-447e-aa30-38cc3ae6cd68","name":"Praveen Kumar J H","selfAssessmentScore":6.7027,"aiAuditScore":3.885},{"id":"9904ae4b-c15a-4df2-82ba-743f2457beeb","name":"Raghu R","selfAssessmentScore":8.2162,"aiAuditScore":3.92},{"id":"3f6328b4-7884-402c-baa6-3125b8f821a9","name":"Rashmi Sachin Desai","selfAssessmentScore":7.2973,"aiAuditScore":3.965},{"id":"8ae45059-1bdd-43d2-8367-2994e6808a94","name":"Amritpal Singh","selfAssessmentScore":9.6757,"aiAuditScore":3.915},{"id":"e330db89-9bd8-43ae-8476-601dd45a5137","name":"Rugved Sambhajirao Yadav","selfAssessmentScore":7.8919,"aiAuditScore":3.91},{"id":"a48ed1b4-1f8a-429e-9609-d0b2cd4c482d","name":"Sweta Soni","selfAssessmentScore":7.7838,"aiAuditScore":3.89},{"id":"6d6d9d1e-70b1-41bb-8f8c-a208ade4a362","name":"Aswin Prasad","selfAssessmentScore":8.7568,"aiAuditScore":3.84},{"id":"ffcfef27-e82c-48d6-ad52-67e23e0b264c","name":"Nitesh Kumar","selfAssessmentScore":9.5676,"aiAuditScore":3.9},{"id":"cbb2d57c-7162-43fa-a2d7-2757262f8b03","name":"Neeti Toppo","selfAssessmentScore":8.0,"aiAuditScore":3.875},{"id":"f809b5b2-5764-4ad2-baed-61fc4658c477","name":"Suman Adithya Rao","selfAssessmentScore":8.0,"aiAuditScore":4.025},{"id":"e88e6cb6-b240-4136-9a02-4e4c163434a8","name":"Vilas L","selfAssessmentScore":0.0,"aiAuditScore":0.0},{"id":"fa5ef157-f765-4bac-bd5d-5d38c1905d03","name":"Venkatesh Barad","selfAssessmentScore":7.5135,"aiAuditScore":3.86},{"id":"81467673-7654-4f92-b1e2-1f6e7b0998d2","name":"Simran Gabrial Masih","selfAssessmentScore":8.3243,"aiAuditScore":4.035},{"id":"6a9f057e-6702-47ea-bfeb-36341a2208cc","name":"Vipul Jain","selfAssessmentScore":8.0,"aiAuditScore":3.815},{"id":"fcde312a-89e5-4a45-ab9f-c9ac459eac23","name":"Dipanwita Saha","selfAssessmentScore":8.4324,"aiAuditScore":3.95},{"id":"0fb9b74c-d11a-41d6-9a31-af7dfdbe23a7","name":"Sayantan Bhattacharyya","selfAssessmentScore":8.3243,"aiAuditScore":3.96},{"id":"02400f6a-0af5-469e-b458-68f2bcfc2c86","name":"Ganesh T","selfAssessmentScore":8.4865,"aiAuditScore":3.58},{"id":"ec6b0f10-1538-426f-99cf-baafa357619d","name":"Sweta Jugran","selfAssessmentScore":8.5946,"aiAuditScore":3.89},{"id":"678c6cef-0a19-4492-a16c-a2c021f50098","name":"Chittimani Bhaviteja","selfAssessmentScore":7.8919,"aiAuditScore":4.045},{"id":"6f4f5186-db8a-44cc-8857-d6cd34600cf9","name":"Riya Goyal","selfAssessmentScore":8.4865,"aiAuditScore":3.775},{"id":"407481ee-da8b-4183-b711-06be75e15992","name":"Kumar M G","selfAssessmentScore":7.5135,"aiAuditScore":3.625},{"id":"2e1e9c1c-d84b-4635-910c-0c9043a1bd20","name":"Ishan Dhadwal","selfAssessmentScore":6.5946,"aiAuditScore":3.72},{"id":"c94d5ce9-8355-43aa-afbe-860a39a158f6","name":"K Prakash Rao","selfAssessmentScore":7.1351,"aiAuditScore":3.965},{"id":"276073a8-0d7d-4773-a110-0c14d42233eb","name":"Akhil M A","selfAssessmentScore":8.2162,"aiAuditScore":3.92},{"id":"4f4db217-024f-49b3-9d0f-1a1795f206fa","name":"Sharique Shahid Ansari","selfAssessmentScore":7.9459,"aiAuditScore":3.89},{"id":"c1a2fd7e-b420-413c-a513-8576560b655b","name":"Shridhar","selfAssessmentScore":9.5135,"aiAuditScore":4.03},{"id":"116f7e33-91b4-44ef-9482-775917db11aa","name":"Shweta Chauhan","selfAssessmentScore":9.0811,"aiAuditScore":3.78},{"id":"efcfff28-ef6c-4bb2-9cc2-3e814854ff39","name":"Ajmal Rahim","selfAssessmentScore":5.9459,"aiAuditScore":3.995},{"id":"bb2824aa-a965-4766-aa0b-93f2b4dc0606","name":"Jyoti Umesh Sulgekar","selfAssessmentScore":7.1351,"aiAuditScore":4.0},{"id":"12260ddf-c8ef-4363-a04e-901d70812367","name":"Ravishankar Mohan Cherukupalli","selfAssessmentScore":9.5135,"aiAuditScore":3.945},{"id":"02d5a439-887d-49aa-8dc3-18c9e1439832","name":"Tanish Kumar Sahoo","selfAssessmentScore":7.9459,"aiAuditScore":3.96},{"id":"d5cbc294-e15b-4e30-905b-0340c71428a1","name":"Jaideep Singh","selfAssessmentScore":7.6757,"aiAuditScore":4.0},{"id":"d3a8a3a4-55ba-41ce-b57b-9d4fc55b0798","name":"Neethu Paulose","selfAssessmentScore":8.7568,"aiAuditScore":3.95},{"id":"984e4f32-a165-4e15-86b0-0decd36f1432","name":"Arpitha L K","selfAssessmentScore":9.8919,"aiAuditScore":3.915},{"id":"9ce130f1-0dd4-42e7-896e-30e61c4f0a07","name":"M Nikhil","selfAssessmentScore":9.6216,"aiAuditScore":3.875},{"id":"7892016b-7760-4b74-b77e-845ad3c2693c","name":"Rajashekharayya Salimath","selfAssessmentScore":7.1892,"aiAuditScore":3.845},{"id":"8157def2-2d05-421e-99a3-e2b43f4f56e1","name":"Nayan Hosur","selfAssessmentScore":9.6216,"aiAuditScore":3.895},{"id":"162e1a00-d5f0-4418-826c-8802331631ce","name":"Aditya Karnad","selfAssessmentScore":8.6486,"aiAuditScore":3.955},{"id":"81d07d75-3ee4-4b04-b8dd-5989acb32177","name":"Ashwinkumar A Shet","selfAssessmentScore":7.1892,"aiAuditScore":3.925},{"id":"a75ee6d1-2046-44f9-aeda-3f8410c66ec7","name":"Rohan Ajit Kokane","selfAssessmentScore":8.0,"aiAuditScore":3.98},{"id":"d04ce041-fd5d-4107-85cd-60eb77f1826e","name":"Amit Mahantesh Baligar","selfAssessmentScore":8.7568,"aiAuditScore":3.955},{"id":"48ea5e8a-9cee-4eba-8533-7c680e018de7","name":"Vikas Koti","selfAssessmentScore":8.0,"aiAuditScore":3.58},{"id":"48ce8f8e-96ac-42c5-af14-34277c6a6729","name":"Adnan Parvezahmed Darga","selfAssessmentScore":9.6757,"aiAuditScore":3.94},{"id":"0783e148-eed1-4abe-8da8-016b3258f1d9","name":"Sujay Sanjeev Satpute","selfAssessmentScore":6.8108,"aiAuditScore":3.875},{"id":"055427c9-ae39-44fe-a500-cae00aee50af","name":"Amardeep Narayan Baswa","selfAssessmentScore":8.01,"aiAuditScore":4.005},{"id":"84dc941f-77ce-40f7-b48a-b2cb470d5514","name":"Ankush Ajay Chougule","selfAssessmentScore":9.4054,"aiAuditScore":3.98},{"id":"441cc13e-61cc-4af5-b274-1bf49da31324","name":"Abdulsamad Riyazahmed Jamadar","selfAssessmentScore":9.1351,"aiAuditScore":3.685},{"id":"8a681a5f-4b48-4203-b551-48b08cbd131c","name":"Rakesh Guddadmani","selfAssessmentScore":8.7568,"aiAuditScore":3.91},{"id":"bfe0ce38-b998-491f-82dd-1403c846bbb0","name":"Prajwal","selfAssessmentScore":9.6757,"aiAuditScore":3.67},{"id":"a5366e32-dc77-4d5b-9bc8-dd88f5b057aa","name":"Prathamesh Kakatikar D","selfAssessmentScore":0.0,"aiAuditScore":0.0},{"id":"fd4c3619-7111-40f6-b43f-d66de1718a68","name":"S Raju","selfAssessmentScore":0.0,"aiAuditScore":0.0},{"id":"d95dfea9-4aff-4366-9f90-b0f59de164f3","name":"Rakesh Naik","selfAssessmentScore":9.027,"aiAuditScore":3.915},{"id":"915154f6-8089-496c-9f32-7f2bcca8adc0","name":"Shabaaz Babajan Shaikh","selfAssessmentScore":8.9189,"aiAuditScore":3.93},{"id":"dc7bda68-deaa-4ef7-b733-ffa3bb5528a6","name":"Yalleshi Mareppa Holennavar","selfAssessmentScore":0.0,"aiAuditScore":0.0},{"id":"fc471712-48a7-4ef2-a5dc-44bf7b4da84a","name":"Faisal Javed Shaikh","selfAssessmentScore":8.8649,"aiAuditScore":3.925},{"id":"6b1f45d5-69f4-443f-a967-0ed07ff11519","name":"Nauseen Asif Nargund","selfAssessmentScore":8.2703,"aiAuditScore":3.975},{"id":"c8add316-def6-4ae3-b180-170e171c15cc","name":"Vaibhavi Vinod Balse","selfAssessmentScore":8.1622,"aiAuditScore":4.01},{"id":"10610ff8-6786-4289-98b3-bbcb7378daba","name":"Nisha Shankar Kurubar","selfAssessmentScore":8.9189,"aiAuditScore":4.04},{"id":"c565317b-cabe-4ecc-9670-f5ec0010f440","name":"Anupam Premanand Vernekar","selfAssessmentScore":8.6486,"aiAuditScore":4.015},{"id":"b6955b9a-b7e0-4526-ad62-5c0cf2069aae","name":"Vishal Vijay Chavan","selfAssessmentScore":7.4595,"aiAuditScore":4.005},{"id":"96809b7d-753c-47fd-9dc1-bfa79786b9f1","name":"Nitin Namdev Ningannavar","selfAssessmentScore":8.7027,"aiAuditScore":4.03},{"id":"af635550-2f8a-4b9b-9679-cf3f2149489a","name":"Uday Satish Devakar","selfAssessmentScore":8.0541,"aiAuditScore":3.91},{"id":"86194a4c-019f-46ad-92b5-2ae139eea7b9","name":"Faizan Mohammed Ismail Rangrez","selfAssessmentScore":8.7568,"aiAuditScore":3.93},{"id":"e8757881-5225-4f87-b475-8a234a3a3134","name":"Shubham Oza","selfAssessmentScore":8.4865,"aiAuditScore":3.965},{"id":"28ddb3ef-ea1f-401d-8a70-6952cd844f78","name":"Rohit Rajeshkumar Patil","selfAssessmentScore":8.4865,"aiAuditScore":3.915},{"id":"c565597a-6936-4475-944b-6e29551d06cb","name":"Nehal Ravindra Kallimani","selfAssessmentScore":8.6486,"aiAuditScore":3.96},{"id":"257554d7-0bd0-49e3-8d32-1bd78819874a","name":"Juned Peerjade","selfAssessmentScore":8.973,"aiAuditScore":3.655},{"id":"01937bd6-1f16-4db8-9896-fd454b8afaf5","name":"Wagesh Gopal Jadhav","selfAssessmentScore":8.4865,"aiAuditScore":3.74},{"id":"b591f0ab-7385-4755-989c-695c809a7ac3","name":"Taha Shaikh","selfAssessmentScore":8.6486,"aiAuditScore":3.65},{"id":"1fd6946d-9a43-48bc-8e13-bec5b5e4aef1","name":"Shubham Sambhaji Bhadavankar","selfAssessmentScore":8.4865,"aiAuditScore":3.965},{"id":"79e6a309-d9de-4c36-9e15-04614d4d9c81","name":"Mohammed Younus C A","selfAssessmentScore":8.5946,"aiAuditScore":3.765},{"id":"7f7799ff-a76d-4ce3-a38a-8f4e70381f77","name":"Nikhil Subhash Chavan","selfAssessmentScore":8.1081,"aiAuditScore":3.965},{"id":"8a5cc4ce-d5d4-45bc-913b-53eb7a2c2c65","name":"Gautam Shah","selfAssessmentScore":7.7838,"aiAuditScore":3.945},{"id":"b4c263c6-b8fb-4672-91e3-c0bad5277162","name":"Sneahaal Mulaawadmath","selfAssessmentScore":9.4595,"aiAuditScore":3.965},{"id":"0aad546a-7470-495a-87ce-e41765728dc6","name":"Saivishal Vinod Balse","selfAssessmentScore":7.5135,"aiAuditScore":4.03},{"id":"139dedd5-5372-433d-bb4b-e70c7bd86d9f","name":"Nitin Nagoji Chikke","selfAssessmentScore":8.5405,"aiAuditScore":4.03},{"id":"956dc97b-9215-419f-bfc6-3571447a38a7","name":"Gajanan Ternikar","selfAssessmentScore":7.0811,"aiAuditScore":3.915},{"id":"82a9a65a-28dc-4d54-bde1-d45733374e2f","name":"Nagaratna Mahantesh Marihal","selfAssessmentScore":8.2703,"aiAuditScore":3.915},{"id":"7d34ed29-7934-4edd-9c6a-3fe026b41baa","name":"Aaqib Beerwala","selfAssessmentScore":8.5946,"aiAuditScore":3.85},{"id":"be943366-a0c4-4b93-93c3-f277a3bbedae","name":"Nagesh Pednekar","selfAssessmentScore":7.5676,"aiAuditScore":3.86},{"id":"de299aa0-0bb7-4ca4-934d-6c0d49204aff","name":"Suraj Praveen Motimath","selfAssessmentScore":9.027,"aiAuditScore":3.79},{"id":"20ace82d-d344-4d9d-a03c-c9b49ce1173d","name":"Amit Goudadi","selfAssessmentScore":8.5946,"aiAuditScore":4.0},{"id":"fc1a3baf-9d22-42ae-959d-e24bc23a3ab8","name":"Anuj Ajay Chougule","selfAssessmentScore":8.5946,"aiAuditScore":3.645},{"id":"5b0ad595-96b7-4f03-9503-8fb209582dc9","name":"Sumanth Kumar Sahu","selfAssessmentScore":9.0811,"aiAuditScore":3.89},{"id":"cf75bd95-6afc-4e74-ac00-5b9685ecfd37","name":"Amulya K","selfAssessmentScore":6.4865,"aiAuditScore":3.81},{"id":"1822a733-759e-4e3f-94d0-67d9049d8896","name":"Anup Sadanandan","selfAssessmentScore":7.1892,"aiAuditScore":3.96},{"id":"608b4f2c-d5c7-41d2-955a-4e05dc759a96","name":"Maya M Pillai","selfAssessmentScore":6.5946,"aiAuditScore":3.39},{"id":"fd668bc5-c086-4beb-af51-373b378c988e","name":"Rohan Jain","selfAssessmentScore":6.5946,"aiAuditScore":3.655},{"id":"7766dd71-78cd-4fb1-96d0-3490660ef771","name":"Mehul Harihar Dhande","selfAssessmentScore":0.0,"aiAuditScore":0.0},{"id":"1d244d11-81a2-4504-b109-279765ed1d48","name":"Vivek Kumar Verma","selfAssessmentScore":4.7027,"aiAuditScore":3.86},{"id":"09b5d23a-16cb-43c4-b549-7a05536897e0","name":"Prathvik Saldanha","selfAssessmentScore":7.3514,"aiAuditScore":3.945},{"id":"bbd701c1-f99b-4e67-9bf9-3adc4f556d1f","name":"Jay Prakash Singh","selfAssessmentScore":7.7838,"aiAuditScore":4.01},{"id":"a6e33eb2-e8cd-4057-b255-0606bdb06cf4","name":"Hunny","selfAssessmentScore":0.0,"aiAuditScore":0.0},{"id":"fea5841e-a864-482b-ab7e-82802610e67d","name":"Ravikumar Mangilal Shah","selfAssessmentScore":7.5135,"aiAuditScore":3.895},{"id":"46202910-3f01-4f04-a999-806501090909","name":"Sadiya Banu","selfAssessmentScore":8.5946,"aiAuditScore":3.885},{"id":"46f37dce-3248-4dd3-bd62-08290153de81","name":"Sangeetha P","selfAssessmentScore":8.2162,"aiAuditScore":3.9},{"id":"f1b2a8d0-e99b-4127-b1c5-469fe7d2bf1a","name":"Regan Lobo","selfAssessmentScore":8.4865,"aiAuditScore":3.96},{"id":"c48bf1e4-4de4-4f9d-bb01-167fcc446650","name":"Sarfaraj Najeer Kudachee","selfAssessmentScore":7.2973,"aiAuditScore":3.785},{"id":"a1e578be-12e2-46c8-8729-f0a23ee115af","name":"Naman Prakash Awasthi","selfAssessmentScore":8.973,"aiAuditScore":3.855},{"id":"0f1822b5-a997-49b1-a8a6-238e88715cba","name":"Prateek Manvi","selfAssessmentScore":9.3514,"aiAuditScore":3.89},{"id":"934bea9b-8b1e-407f-958b-fb8762f1bb0d","name":"Amar Vishwakarma","selfAssessmentScore":7.5676,"aiAuditScore":3.885},{"id":"49d5b511-ed80-4884-9b4d-b550698d1140","name":"Shivanjali Kumari","selfAssessmentScore":9.7297,"aiAuditScore":3.965},{"id":"1192c2ec-d6df-4bbd-b4c1-2f5d4309c22e","name":"M Vinod","selfAssessmentScore":8.5405,"aiAuditScore":2.63},{"id":"882cfa94-d397-4f9c-92d8-5e27c58a0ca7","name":"Shaktiprasad Bentur","selfAssessmentScore":8.2703,"aiAuditScore":4.105},{"id":"25776972-3018-465a-9b82-1126895cadbf","name":"Vivek G K","selfAssessmentScore":8.5405,"aiAuditScore":3.955},{"id":"d4e08186-15e8-49ae-aca5-c8dd3c876a6c","name":"Rakesh S Sankangoudar","selfAssessmentScore":9.6757,"aiAuditScore":3.91},{"id":"f87cc375-7a63-4f1e-84b3-dc9340744d4e","name":"Gonegondla Karanam Venkata Karthik","selfAssessmentScore":8.2162,"aiAuditScore":3.725},{"id":"26bc8376-cec9-4e0d-8395-0aaaef860734","name":"Adarsh Singh Gautam","selfAssessmentScore":7.9459,"aiAuditScore":4.05},{"id":"f0cc8a0f-1da4-4c77-a7c3-855d3b18b9c9","name":"Shalini Y S","selfAssessmentScore":0.0,"aiAuditScore":0.0},{"id":"9f695785-b2c3-48df-8f0b-23e9cfb6b10b","name":"Girish A","selfAssessmentScore":8.2703,"aiAuditScore":3.825},{"id":"df439b59-6726-44fa-b884-a0f54e7ecb04","name":"Saqlain Khalique Shaikh","selfAssessmentScore":8.1081,"aiAuditScore":3.85},{"id":"64bebad9-f1ca-4b05-b815-31b0d2500e61","name":"M Kiran","selfAssessmentScore":5.7297,"aiAuditScore":3.725},{"id":"117505e2-7381-435f-9906-ac6dccd3bfa6","name":"Keyur P Shah","selfAssessmentScore":8.5946,"aiAuditScore":3.67},{"id":"028f0c7f-f4a7-49c8-85a9-67cf5819f715","name":"Aimen Nasardi","selfAssessmentScore":8.2162,"aiAuditScore":3.515},{"id":"16448b34-bcbb-4b15-aa2a-81004f81dcc4","name":"Shrikanth K","selfAssessmentScore":8.0,"aiAuditScore":3.85},{"id":"f1247b40-2617-4a19-bbe7-c387a1c5a033","name":"Srawani Deka Basumatary","selfAssessmentScore":8.1622,"aiAuditScore":4.0},{"id":"d8995e9a-5183-4748-bc0f-ae969956d4a0","name":"Vishvajeet Singh","selfAssessmentScore":8.0,"aiAuditScore":3.77},{"id":"328aefe9-dee0-447d-97f9-9ae3694aec47","name":"Harshvardhan Singh Rathore","selfAssessmentScore":7.8378,"aiAuditScore":4.015},{"id":"fcf4ed94-342f-4447-b4ce-ba365ad0f939","name":"Pratik P Bontra","selfAssessmentScore":8.0,"aiAuditScore":3.82},{"id":"9b097f1a-540b-467b-be3a-5d8eaf687fdf","name":"Rajan Kiran Wagh","selfAssessmentScore":8.0,"aiAuditScore":3.86},{"id":"79380e8f-f0b5-48d8-bc26-6cbc0b624e26","name":"Vipul Prakash Sande","selfAssessmentScore":7.8378,"aiAuditScore":3.97},{"id":"c074e3a6-9dfe-4a10-9ec0-9788304a0b7c","name":"Roshan KM","selfAssessmentScore":7.5135,"aiAuditScore":3.52},{"id":"d3de14bd-eca8-4e9f-935d-ffa38e33d1be","name":"Shashank Verma","selfAssessmentScore":7.027,"aiAuditScore":3.675},{"id":"e8d58f9d-142d-4a24-ae2f-a2f8c0118d88","name":"Martin Davis","selfAssessmentScore":6.7568,"aiAuditScore":3.8},{"id":"3fdc1327-b869-481f-9afd-40a11351675c","name":"Shrutika Sumit Jain","selfAssessmentScore":8.3784,"aiAuditScore":3.85},{"id":"9e6ab7f0-2ade-4f13-89ad-d6340f5a5df4","name":"Fiza Kouser","selfAssessmentScore":7.8919,"aiAuditScore":3.67},{"id":"59fec208-495d-443b-b40c-ee7c3a164428","name":"Tejas K Madeval","selfAssessmentScore":7.9459,"aiAuditScore":3.67},{"id":"8acf0bc6-e9fb-49fc-b379-fae2e37f5b20","name":"Khushpreet Kaur","selfAssessmentScore":9.6757,"aiAuditScore":3.85},{"id":"3d7aae1f-410f-46fe-8401-64f811776a1d","name":"Priyank Sharma","selfAssessmentScore":8.6486,"aiAuditScore":4.025},{"id":"46c97ac4-444f-4c78-9f86-a9c7cf5bf307","name":"Masooma Yousuf","selfAssessmentScore":8.4865,"aiAuditScore":3.525},{"id":"5075478b-da97-43b7-b611-965b2b63a541","name":"Nitin Tanajirao Pimpalpalle","selfAssessmentScore":8.973,"aiAuditScore":4.03},{"id":"24c94439-f141-4a83-a746-76ef86f3b4df","name":"S Mohammed Akhil","selfAssessmentScore":9.6216,"aiAuditScore":3.865},{"id":"9d5de090-8279-441b-b14a-be3b0bb850b9","name":"Ankit Agarwal","selfAssessmentScore":8.7027,"aiAuditScore":3.82},{"id":"f68f264a-5b27-431c-81f5-0567ef7d39ec","name":"Murgendra Rajashekhar Patil","selfAssessmentScore":8.8649,"aiAuditScore":3.77},{"id":"97d039e5-28b3-44f7-9b22-124dd0e2d8c3","name":"Sneha Shrikar","selfAssessmentScore":0.0,"aiAuditScore":0.0},{"id":"afa5e04d-c1d2-4ce6-a1ab-74dc6fee403f","name":"Mary Salins","selfAssessmentScore":9.7297,"aiAuditScore":3.985},{"id":"679da5f3-74b3-4117-b921-31526ba68399","name":"Sridevi K V","selfAssessmentScore":7.5135,"aiAuditScore":3.82},{"id":"4206ad91-de0a-4fe9-bbe7-1083d8d85ca4","name":"Suman Janghel","selfAssessmentScore":7.4054,"aiAuditScore":3.725},{"id":"4df77631-01e1-4c5f-9c36-a61049de92db","name":"Chandan Kumar","selfAssessmentScore":0.0,"aiAuditScore":0.0},{"id":"9401e397-bd08-4d3a-943a-2edace78581b","name":"Rahul Kumar","selfAssessmentScore":7.4595,"aiAuditScore":3.85},{"id":"52b3832c-6f38-4003-8184-6bde7df128f1","name":"Ravi Kumar Deo","selfAssessmentScore":6.973,"aiAuditScore":3.66},{"id":"4d4cceea-51ef-4ba3-b42d-26237073382e","name":"Vishal Bhattar","selfAssessmentScore":8.1081,"aiAuditScore":3.62},{"id":"5710743d-1806-4493-bf29-f2aa4175ad50","name":"Rohini Kumari","selfAssessmentScore":7.7838,"aiAuditScore":3.67},{"id":"6efc9a26-5f32-4a1e-a6a2-61bb7a586b49","name":"Uma Bohra","selfAssessmentScore":0.0,"aiAuditScore":0.0},{"id":"0b504567-5290-46c3-9d2f-3675d8b2b6ed","name":"Nikhil Murlidhar Bhatkar","selfAssessmentScore":8.1622,"aiAuditScore":3.725},{"id":"ac68f2b3-e984-4e4a-bfd6-6f7558bb7ec1","name":"Deepanshi Lalwani","selfAssessmentScore":8.973,"aiAuditScore":3.895},{"id":"7e47d241-7cfd-4fff-aae6-166ab2d463d6","name":"Roshni","selfAssessmentScore":7.6757,"aiAuditScore":3.925},{"id":"8c2f4304-e7a4-4541-9e77-d16137998ea9","name":"Mayank Lodha","selfAssessmentScore":6.4324,"aiAuditScore":3.825},{"id":"b2dcc32a-577e-4d2d-88b1-0904dafeb532","name":"Alamgir Haque","selfAssessmentScore":6.6486,"aiAuditScore":3.715},{"id":"bb8d945d-f0be-49a7-b3bb-5a9baae920db","name":"Karthik R","selfAssessmentScore":7.8378,"aiAuditScore":3.67},{"id":"2437bc2d-90df-4e21-8eff-ead2e3fd3f39","name":"Sachinkumar Ghanti B","selfAssessmentScore":9.4595,"aiAuditScore":3.885},{"id":"fa601a3e-fb78-4533-b029-307ef22bb0c4","name":"Bharat Halagalimath","selfAssessmentScore":7.7297,"aiAuditScore":3.765}];

  async function _aiAuditLoad() {
    const rec = await DB.get('settings', _AI_AUDIT_KEY);
    if (rec && rec.value) return JSON.parse(rec.value);
    return null; // not seeded yet
  }

  async function _aiAuditSave(records) {
    await DB.put('settings', { key: _AI_AUDIT_KEY, value: JSON.stringify(records) });
  }

  async function loadAiAuditScores() {
    const tbody = $('ai-audit-tbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="6" class="empty-state">Loading…</td></tr>';
    try {
      let data = await _aiAuditLoad();
      if (data === null) {
        // First visit — seed from embedded data
        data = _AI_AUDIT_SEED;
        await _aiAuditSave(data);
      }
      _allAuditRecords   = data;
      _filteredAuditRecs = [...data];
      _selectedAuditIds.clear();
      _renderAuditTable();
    } catch (e) {
      if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="empty-state" style="color:var(--danger)">Failed to load AI Audit Scores: ' + e.message + '</td></tr>';
      console.error('loadAiAuditScores:', e);
    }
  }

  function filterAiAudit(query) {
    const q = (query || '').trim().toLowerCase();
    _filteredAuditRecs = q
      ? _allAuditRecords.filter(r => r.name.toLowerCase().includes(q))
      : [..._allAuditRecords];
    _selectedAuditIds.clear();
    _renderAuditTable();
  }

  // Build a single audit row's HTML (shared by flat + grouped render)
  function _auditRowHtml(r, idx) {
    return `
      <tr id="audit-row-${r.id}">
        <td style="width:36px;text-align:center">
          <input type="checkbox" class="audit-cb" data-id="${r.id}"
            onchange="Admin.toggleAuditCheckbox('${r.id}', this.checked)" />
        </td>
        <td style="color:var(--text-muted);font-size:0.8rem">${idx}</td>
        <td style="font-weight:500">${r.name}</td>
        <td style="text-align:right" id="self-score-cell-${r.id}">
          <span id="self-score-display-${r.id}" style="color:var(--text-muted)">
            ${r.selfAssessmentScore != null ? Number(r.selfAssessmentScore).toFixed(4) : '—'}
          </span>
          <span id="self-score-edit-${r.id}" style="display:none;align-items:center;gap:0.4rem;justify-content:flex-end">
            <input type="number" id="self-score-input-${r.id}" step="0.0001" min="0" max="100"
              value="${r.selfAssessmentScore != null ? r.selfAssessmentScore : ''}"
              style="width:90px;padding:0.2rem 0.4rem;border:1px solid var(--text-muted);border-radius:4px;font-size:0.875rem;text-align:right" />
            <button onclick="Admin.saveSelfScore('${r.id}')" class="btn-primary" style="padding:0.2rem 0.6rem;font-size:0.8rem">Save</button>
            <button onclick="Admin.cancelSelfScoreEdit('${r.id}')" class="btn-ghost" style="padding:0.2rem 0.5rem;font-size:0.8rem">✕</button>
          </span>
        </td>
        <td style="text-align:right" id="audit-score-cell-${r.id}">
          <span id="audit-score-display-${r.id}" style="font-weight:600;color:var(--primary)">
            ${r.aiAuditScore != null ? Number(r.aiAuditScore).toFixed(4) : '—'}
          </span>
          <span id="audit-score-edit-${r.id}" style="display:none;align-items:center;gap:0.4rem;justify-content:flex-end">
            <input type="number" id="audit-score-input-${r.id}" step="0.0001" min="0" max="100"
              value="${r.aiAuditScore != null ? r.aiAuditScore : ''}"
              style="width:90px;padding:0.2rem 0.4rem;border:1px solid var(--primary);border-radius:4px;font-size:0.875rem;text-align:right" />
            <button onclick="Admin.saveAuditScore('${r.id}')" class="btn-primary" style="padding:0.2rem 0.6rem;font-size:0.8rem">Save</button>
            <button onclick="Admin.cancelAuditEdit('${r.id}')" class="btn-ghost" style="padding:0.2rem 0.5rem;font-size:0.8rem">✕</button>
          </span>
        </td>
        <td style="text-align:center">
          <div style="display:flex;gap:0.3rem;justify-content:center">
            <button onclick="Admin.editSelfScore('${r.id}')" title="Edit Self Assessment Score"
              style="background:none;border:none;cursor:pointer;font-size:1rem;padding:0.2rem">✏️</button>
            <button onclick="Admin.editAuditScore('${r.id}')" title="Edit AI Audit Score"
              style="background:none;border:none;cursor:pointer;font-size:1rem;padding:0.2rem">🎯</button>
            <button onclick="Admin.deleteSingleAuditScore('${r.id}', '${r.name.replace(/'/g,"&#39;")}')" title="Delete"
              style="background:none;border:none;cursor:pointer;font-size:1rem;padding:0.2rem">🗑</button>
          </div>
        </td>
      </tr>`;
  }

  function _renderAuditTable() {
    const tbody = $('ai-audit-tbody');
    const count = $('ai-audit-count');
    const allCb = $('select-all-audit');
    if (!tbody) return;

    if (allCb) { allCb.checked = false; allCb.indeterminate = false; }
    _updateAuditDeleteBtn();

    if (!_filteredAuditRecs.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No records found.</td></tr>';
      if (count) count.textContent = '';
      return;
    }

    // Group records by manager
    const managerGroups = {};
    const unassigned    = [];
    _filteredAuditRecs.forEach(r => {
      const mgr = _getAgentManager(r.name);
      if (mgr) {
        if (!managerGroups[mgr]) managerGroups[mgr] = [];
        managerGroups[mgr].push(r);
      } else {
        unassigned.push(r);
      }
    });

    let html = '';
    let globalIdx = 0;

    const renderSection = (managerName, records) => {
      const selfVals = records.map(r => r.selfAssessmentScore).filter(v => v != null && !isNaN(v) && v !== 0);
      const aiVals   = records.map(r => r.aiAuditScore).filter(v => v != null && !isNaN(v) && v !== 0);
      const avgSelf  = selfVals.length ? (selfVals.reduce((a, b) => a + b, 0) / selfVals.length).toFixed(3) : '—';
      const avgAI    = aiVals.length   ? (aiVals.reduce((a, b) => a + b, 0)   / aiVals.length).toFixed(3)   : '—';

      html += `<tr style="background:#eef2ff;border-top:2px solid #c7d2fe">
        <td colspan="3" style="font-weight:700;color:#3730a3;font-size:0.88rem;padding:0.45rem 0.75rem">
          👤 ${managerName}
          <span style="font-weight:400;color:var(--text-muted);font-size:0.78rem;margin-left:0.5rem">(${records.length} agent${records.length !== 1 ? 's' : ''})</span>
        </td>
        <td style="text-align:right;font-size:0.78rem;color:var(--text-muted);font-weight:600;background:#eef2ff">Avg: ${avgSelf}</td>
        <td style="text-align:right;font-size:0.78rem;color:#3730a3;font-weight:600;background:#eef2ff">Avg: ${avgAI}</td>
        <td style="background:#eef2ff"></td>
      </tr>`;

      records.forEach(r => {
        globalIdx++;
        html += _auditRowHtml(r, globalIdx);
      });
    };

    Object.entries(managerGroups).sort(([a], [b]) => a.localeCompare(b)).forEach(([mgr, recs]) => {
      renderSection(mgr, recs);
    });
    if (unassigned.length) {
      renderSection('(No Manager Assigned)', unassigned);
    }

    tbody.innerHTML = html;
    if (count) count.textContent = `Showing ${_filteredAuditRecs.length} of ${_allAuditRecords.length} record${_allAuditRecords.length !== 1 ? 's' : ''}`;
  }

  function _updateAuditDeleteBtn() {
    const btn = $('btn-delete-selected-audit');
    if (!btn) return;
    const n = _selectedAuditIds.size;
    btn.disabled = n === 0;
    btn.textContent = n > 0 ? `🗑 Delete Selected (${n})` : '🗑 Delete Selected';
  }

  function toggleAuditCheckbox(id, checked) {
    if (checked) _selectedAuditIds.add(id);
    else         _selectedAuditIds.delete(id);
    _updateAuditDeleteBtn();
    const allCb = $('select-all-audit');
    if (allCb && _filteredAuditRecs.length > 0) {
      const n = _selectedAuditIds.size;
      allCb.indeterminate = n > 0 && n < _filteredAuditRecs.length;
      allCb.checked = n === _filteredAuditRecs.length;
    }
  }

  function toggleAllAudit(checked) {
    _selectedAuditIds.clear();
    if (checked) _filteredAuditRecs.forEach(r => _selectedAuditIds.add(r.id));
    document.querySelectorAll('.audit-cb').forEach(cb => { cb.checked = checked; });
    _updateAuditDeleteBtn();
  }

  function editAuditScore(id) {
    const display = $(`audit-score-display-${id}`);
    const editEl  = $(`audit-score-edit-${id}`);
    if (!display || !editEl) return;
    display.style.display = 'none';
    editEl.style.display  = 'inline-flex';
    const input = $(`audit-score-input-${id}`);
    if (input) { input.focus(); input.select(); }
  }

  function cancelAuditEdit(id) {
    const display = $(`audit-score-display-${id}`);
    const editEl  = $(`audit-score-edit-${id}`);
    if (!display || !editEl) return;
    display.style.display = '';
    editEl.style.display  = 'none';
  }

  // ---- Self Assessment Score inline edit ----
  function editSelfScore(id) {
    const display = $(`self-score-display-${id}`);
    const editEl  = $(`self-score-edit-${id}`);
    if (!display || !editEl) return;
    display.style.display = 'none';
    editEl.style.display  = 'inline-flex';
    const input = $(`self-score-input-${id}`);
    if (input) { input.focus(); input.select(); }
  }

  function cancelSelfScoreEdit(id) {
    const display = $(`self-score-display-${id}`);
    const editEl  = $(`self-score-edit-${id}`);
    if (!display || !editEl) return;
    display.style.display = '';
    editEl.style.display  = 'none';
  }

  async function saveSelfScore(id) {
    const input = $(`self-score-input-${id}`);
    if (!input) return;
    const val = parseFloat(input.value);
    if (isNaN(val)) { toast('Please enter a valid number.', 'error'); return; }
    try {
      const rec  = _allAuditRecords.find(r => r.id === id);
      const recF = _filteredAuditRecs.find(r => r.id === id);
      if (rec)  rec.selfAssessmentScore  = val;
      if (recF) recF.selfAssessmentScore = val;
      await _aiAuditSave(_allAuditRecords);
      const display = $(`self-score-display-${id}`);
      if (display) display.textContent = val.toFixed(4);
      cancelSelfScoreEdit(id);
      toast('Self Assessment Score updated.', 'success');
    } catch (e) {
      console.error('saveSelfScore:', e);
      toast('Failed to save: ' + e.message, 'error');
    }
  }

  async function saveAuditScore(id) {
    const input = $(`audit-score-input-${id}`);
    if (!input) return;
    const val = parseFloat(input.value);
    if (isNaN(val)) { toast('Please enter a valid number.', 'error'); return; }
    try {
      const rec  = _allAuditRecords.find(r => r.id === id);
      const recF = _filteredAuditRecs.find(r => r.id === id);
      if (rec)  rec.aiAuditScore  = val;
      if (recF) recF.aiAuditScore = val;
      await _aiAuditSave(_allAuditRecords);
      const display = $(`audit-score-display-${id}`);
      if (display) display.textContent = val.toFixed(4);
      cancelAuditEdit(id);
      toast('AI Audit Score updated.', 'success');
    } catch (e) {
      console.error('saveAuditScore:', e);
      toast('Failed to save: ' + e.message, 'error');
    }
  }

  async function deleteSingleAuditScore(id, name) {
    if (!confirm(`Delete entry for "${name}"?\n\nThis action cannot be undone.`)) return;
    try {
      _allAuditRecords   = _allAuditRecords.filter(r => r.id !== id);
      _filteredAuditRecs = _filteredAuditRecs.filter(r => r.id !== id);
      _selectedAuditIds.delete(id);
      await _aiAuditSave(_allAuditRecords);
      _renderAuditTable();
      toast(`Deleted entry for ${name}.`, 'success');
    } catch (e) {
      toast('Delete failed: ' + e.message, 'error');
    }
  }

  async function deleteSelectedAuditScores() {
    const ids = [..._selectedAuditIds];
    if (!ids.length) return;
    if (!confirm(`Delete ${ids.length} selected record${ids.length !== 1 ? 's' : ''}?\n\nThis action cannot be undone.`)) return;
    try {
      _allAuditRecords   = _allAuditRecords.filter(r => !ids.includes(r.id));
      _filteredAuditRecs = _filteredAuditRecs.filter(r => !ids.includes(r.id));
      _selectedAuditIds.clear();
      await _aiAuditSave(_allAuditRecords);
      _renderAuditTable();
      toast(`Deleted ${ids.length} record${ids.length !== 1 ? 's' : ''}.`, 'success');
    } catch (e) {
      toast('Delete failed: ' + e.message, 'error');
    }
  }

  async function deleteAllAuditScores() {
    if (!_allAuditRecords.length) { toast('No records to delete.', ''); return; }
    const step1 = confirm(`⚠️ Delete ALL ${_allAuditRecords.length} AI Audit Score records?\n\nThis action cannot be undone.`);
    if (!step1) return;
    const step2 = confirm(`Are you absolutely sure? All ${_allAuditRecords.length} records will be permanently removed.`);
    if (!step2) return;
    try {
      _allAuditRecords   = [];
      _filteredAuditRecs = [];
      _selectedAuditIds.clear();
      await _aiAuditSave([]);
      _renderAuditTable();
      toast('All AI Audit Score records deleted.', 'success');
    } catch (e) {
      toast('Delete failed: ' + e.message, 'error');
    }
  }


  // ================================================================
  //  COMM360 MASTER REPORT SECTION
  // ================================================================

  const _TICKET_TEAM_MANAGERS = new Set([
    'Renuka Mishra', 'Basavaraj Gurav', 'Ratanjeet Maharaj',
    'Gopi Kiran', 'Shwethayini', 'Swanand Dixit', 'Girish A'
  ]);

  let _comm360AllRows    = [];
  let _comm360Filtered   = [];
  let _comm360TeamFilter = 'all';
  let _comm360SearchQ    = '';

  // Build live DB score lookup: canonicalName → { psScore, lisScore, mcScore, gramScore }
  async function _buildLiveScoreMap() {
    const r2 = v => Math.round(v * 100) / 100;
    try {
      const [trainees, sessions, preservedRec] = await Promise.all([
        DB.getAll('trainees'),
        DB.getAll('sessions'),
        DB.get('settings', 'preservedReportScores')
      ]);
      const liveMap = {};
      trainees.forEach(trainee => {
        const canonical = _resolveAlias(trainee.name);
        const { scores } = computeAgentScores(trainee.id, sessions);
        const live = {};
        if (scores['pick-speak']         != null) live.psScore   = r2(scores['pick-speak']         / 100 * 20);
        if (scores['listening-assessment'] != null) live.lisScore = r2(scores['listening-assessment'] / 100 * 20);
        if (scores['mock-call']          != null) live.mcScore   = r2(scores['mock-call']          / 100 * 20);
        if (scores['grammar-assessment'] != null) live.gramScore = r2(scores['grammar-assessment'] / 100 * 25);
        if (Object.keys(live).length) liveMap[canonical.toLowerCase()] = live;
      });

      // Merge preserved report scores (e.g. from deleted assessments)
      const preserved = preservedRec && preservedRec.value ? JSON.parse(preservedRec.value) : {};
      for (const [key, scores] of Object.entries(preserved)) {
        const lowKey = key.toLowerCase().trim();
        if (!liveMap[lowKey]) liveMap[lowKey] = {};
        if (liveMap[lowKey].psScore == null && scores.psScore != null)     liveMap[lowKey].psScore   = scores.psScore;
        if (liveMap[lowKey].lisScore == null && scores.lisScore != null)   liveMap[lowKey].lisScore  = scores.lisScore;
        if (liveMap[lowKey].mcScore == null && scores.mcScore != null)     liveMap[lowKey].mcScore   = scores.mcScore;
        if (liveMap[lowKey].gramScore == null && scores.gramScore != null) liveMap[lowKey].gramScore = scores.gramScore;
      }

      return liveMap;
    } catch (e) {
      console.warn('Comm360 live score load failed:', e);
      return {};
    }
  }

  async function _buildComm360Rows() {
    if (_comm360ReportDeleted) {
      return [];
    }
    const liveMap = await _buildLiveScoreMap();
    const rows = [];
    Object.entries(_MANAGER_AGENT_MAP).forEach(([manager, agents]) => {
      const team = _TICKET_TEAM_MANAGERS.has(manager) ? 'Tickets' : 'Calls';
      agents.forEach(agentName => {
        const key = agentName.toLowerCase();
        const ms  = getMasterScores(agentName); // uses alias resolution + fuzzy match
        const live = liveMap[key] || {};

        // SA / AI always from MASTER_SCORES (manually uploaded, not in DB sessions)
        const selfAssessment = ms ? ms.selfAssessment : null;
        const aiAudit        = ms ? ms.aiAudit        : null;

        // Module scores: prefer live DB, fall back to MASTER_SCORES historical
        const psScore   = live.psScore   != null ? live.psScore   : (ms ? ms.psScore   : null);
        const lisScore  = live.lisScore  != null ? live.lisScore  : (ms ? ms.lisScore  : null);
        const mcScore   = live.mcScore   != null ? live.mcScore   : (ms ? ms.mcScore   : null);
        const gramScore = live.gramScore != null ? live.gramScore : (ms ? ms.gramScore : null);

        // Recompute total from components so live scores flow through
        const parts = [selfAssessment, aiAudit, psScore, lisScore, mcScore, gramScore].filter(v => v != null);
        const totalScore = parts.length ? parseFloat(parts.reduce((a, b) => a + b, 0).toFixed(2)) : null;

        rows.push({ name: agentName, manager, team, selfAssessment, aiAudit, psScore, lisScore, mcScore, gramScore, totalScore });
      });
    });
    rows.sort((a, b) => a.manager.localeCompare(b.manager) || a.name.localeCompare(b.name));
    return rows;
  }

  async function loadComm360Report() {
    const tbody = $('comm360-tbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="11" class="empty-state">Loading…</td></tr>';
    _comm360TeamFilter = 'all';
    _comm360SearchQ    = '';
    ['all', 'calls', 'tickets'].forEach(t => {
      const btn = $(`comm360-filter-${t}`);
      if (btn) btn.className = t === 'all' ? 'btn-primary' : 'btn-ghost';
    });
    const searchEl = $('comm360-search');
    if (searchEl) searchEl.value = '';
    _comm360AllRows  = await _buildComm360Rows();
    _comm360Filtered = [..._comm360AllRows];
    _renderComm360Table();
  }

  function filterComm360(team) {
    _comm360TeamFilter = team;
    ['all', 'calls', 'tickets'].forEach(t => {
      const btn = $(`comm360-filter-${t}`);
      if (btn) btn.className = t === team ? 'btn-primary' : 'btn-ghost';
    });
    _applyComm360Filter();
  }

  function searchComm360(query) {
    _comm360SearchQ = (query || '').trim().toLowerCase();
    _applyComm360Filter();
  }

  function _applyComm360Filter() {
    let rows = _comm360AllRows;
    if (_comm360TeamFilter !== 'all') {
      const target = _comm360TeamFilter === 'calls' ? 'Calls' : 'Tickets';
      rows = rows.filter(r => r.team === target);
    }
    if (_comm360SearchQ) {
      rows = rows.filter(r =>
        r.name.toLowerCase().includes(_comm360SearchQ) ||
        r.manager.toLowerCase().includes(_comm360SearchQ)
      );
    }
    _comm360Filtered = rows;
    _renderComm360Table();
  }

  function _c360fmt(val, dec) {
    if (val == null || isNaN(val)) return '<span style="color:var(--text-muted)">—</span>';
    return Number(val).toFixed(dec != null ? dec : 2);
  }

  function _renderComm360Table() {
    const tbody = $('comm360-tbody');
    const count = $('comm360-count');
    if (!tbody) return;

    const delBtn = $('btn-delete-comm360');
    if (delBtn) {
      if (_comm360ReportDeleted) {
        delBtn.textContent = '🔄 Restore Report';
        delBtn.className = 'btn-ghost';
        delBtn.onclick = () => Admin.restoreEntireComm360Report();
      } else {
        delBtn.textContent = '🗑 Delete Report';
        delBtn.className = 'btn-ghost btn-ghost-danger';
        delBtn.onclick = () => Admin.deleteEntireComm360Report();
      }
    }

    if (!_comm360Filtered.length) {
      tbody.innerHTML = '<tr><td colspan="11" class="empty-state">No records found.</td></tr>';
      if (count) count.textContent = '';
      return;
    }

    const groups = {};
    _comm360Filtered.forEach(r => {
      if (!groups[r.manager]) groups[r.manager] = [];
      groups[r.manager].push(r);
    });

    let html = '';
    let idx  = 0;

    Object.entries(groups).sort(([a], [b]) => a.localeCompare(b)).forEach(([manager, recs]) => {
      const team = recs[0].team;
      const teamBadge = team === 'Tickets'
        ? '<span style="background:#d1fae5;color:#065f46;font-size:0.7rem;padding:0.1rem 0.4rem;border-radius:4px;margin-left:0.4rem">🎫 Tickets</span>'
        : '<span style="background:#dbeafe;color:#1e3a8a;font-size:0.7rem;padding:0.1rem 0.4rem;border-radius:4px;margin-left:0.4rem">📞 Calls</span>';
      const psRecs = recs.filter(r => r.psScore != null);
      const avgPs  = psRecs.length
        ? (psRecs.reduce((a, r) => a + r.psScore, 0) / psRecs.length).toFixed(2)
        : '—';

      html += `<tr style="background:#eef2ff;border-top:2px solid #c7d2fe">
        <td colspan="4" style="font-weight:700;color:#3730a3;font-size:0.88rem;padding:0.45rem 0.75rem">
          👤 ${manager}${teamBadge}
          <span style="font-weight:400;color:var(--text-muted);font-size:0.78rem;margin-left:0.5rem">(${recs.length} agent${recs.length !== 1 ? 's' : ''})</span>
        </td>
        <td colspan="2" style="background:#eef2ff"></td>
        <td style="text-align:right;font-size:0.78rem;color:#3730a3;font-weight:600;background:#eef2ff">Avg: ${avgPs}</td>
        <td colspan="3" style="background:#eef2ff"></td>
      </tr>`;

      recs.forEach(r => {
        idx++;
        const teamCell = r.team === 'Tickets'
          ? '<span style="background:#d1fae5;color:#065f46;font-size:0.7rem;padding:0.1rem 0.4rem;border-radius:4px">🎫</span>'
          : '<span style="background:#dbeafe;color:#1e3a8a;font-size:0.7rem;padding:0.1rem 0.4rem;border-radius:4px">📞</span>';
        const totalColor = r.totalScore == null ? 'inherit'
          : r.totalScore >= 60 ? 'var(--success)'
          : r.totalScore >= 40 ? 'var(--warning)'
          : 'var(--danger)';
        html += `<tr>
          <td style="color:var(--text-muted);font-size:0.8rem;text-align:center">${idx}</td>
          <td style="font-weight:500">${r.name}</td>
          <td style="color:var(--text-muted);font-size:0.85rem">${r.manager}</td>
          <td style="text-align:center">${teamCell}</td>
          <td style="text-align:right">${_c360fmt(r.selfAssessment)}</td>
          <td style="text-align:right;color:var(--primary);font-weight:600">${_c360fmt(r.aiAudit)}</td>
          <td style="text-align:right">${_c360fmt(r.psScore)}</td>
          <td style="text-align:right">${_c360fmt(r.lisScore)}</td>
          <td style="text-align:right">${_c360fmt(r.mcScore)}</td>
          <td style="text-align:right">${_c360fmt(r.gramScore)}</td>
          <td style="text-align:right;font-weight:700;color:${totalColor}">${_c360fmt(r.totalScore)}</td>
        </tr>`;
      });
    });

    tbody.innerHTML = html;
    if (count) count.textContent = `Showing ${_comm360Filtered.length} of ${_comm360AllRows.length} agent${_comm360AllRows.length !== 1 ? 's' : ''}`;
  }

  // Exports whatever is currently shown (respects the team filter + search box),
  // same "current view" convention as exportAssessmentsExcel().
  function downloadMasterExcel() {
    const rows = _comm360Filtered || [];
    if (!rows.length) { toast('No records in the current view to export.', 'error'); return; }
    if (typeof XLSX === 'undefined') { toast('Excel library not loaded — try refreshing the page.', 'error'); return; }
    const data = rows.map((r, i) => ({
      '#':                    i + 1,
      'Name':                 r.name,
      'Manager':              r.manager,
      'Team':                 r.team,
      'Self Assessment':      r.selfAssessment != null ? r.selfAssessment : '',
      'AI Audit':             r.aiAudit        != null ? r.aiAudit        : '',
      'P&S /20':              r.psScore        != null ? r.psScore        : '',
      'Listening /20':        r.lisScore       != null ? r.lisScore       : '',
      'Mock Call/Ticket /20': r.mcScore        != null ? r.mcScore        : '',
      'Grammar /25':          r.gramScore      != null ? r.gramScore      : '',
      'Total /100':           r.totalScore     != null ? r.totalScore     : '',
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    ws['!cols'] = [{ wch: 5 }, { wch: 22 }, { wch: 20 }, { wch: 10 }, { wch: 14 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 18 }, { wch: 12 }, { wch: 12 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Comm360 Master');
    const filename = `comm360_master_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, filename);
    toast(`Exported ${data.length} record(s) to ${filename}`, 'success');
  }

  async function deleteEntireComm360Report() {
    const step1 = confirm("⚠️ Are you sure you want to delete the ENTIRE Comm360 Master Report?\n\nThis will clear all historical master scores and preserved scores. (Live assessment sessions in the DB will remain intact).");
    if (!step1) return;

    const pin = prompt("Enter Admin Password to confirm deletion of the Comm360 Report:");
    if (pin === null) return;

    const pwRec = await DB.get('settings', 'adminPassword');
    const correctPw = pwRec ? pwRec.value : 'admin123';
    if (pin !== correctPw) {
      alert("Invalid password.");
      return;
    }

    try {
      _comm360ReportDeleted = true;
      await DB.put('settings', { key: 'comm360ReportDeleted', value: 'true' });
      await DB.put('settings', { key: 'preservedReportScores', value: '{}' });
      
      _comm360AllRows = [];
      _comm360Filtered = [];
      _renderComm360Table();
      
      toast('Comm360 Master Report deleted.', 'success');
    } catch (e) {
      console.error('Delete comm360 report failed:', e);
      toast('Deletion failed: ' + e.message, 'error');
    }
  }

  async function restoreEntireComm360Report() {
    const step1 = confirm("🔄 Are you sure you want to restore the Comm360 Master Report default scores?");
    if (!step1) return;

    try {
      _comm360ReportDeleted = false;
      await DB.put('settings', { key: 'comm360ReportDeleted', value: 'false' });
      
      _comm360AllRows = await _buildComm360Rows();
      _comm360Filtered = [..._comm360AllRows];
      _renderComm360Table();
      
      toast('Comm360 Master Report restored.', 'success');
    } catch (e) {
      console.error('Restore comm360 report failed:', e);
      toast('Restoration failed: ' + e.message, 'error');
    }
  }


  // ── Populate the re-score manager dropdown ────────────────────────────────
  function _populateRescoreSelect() {
    const sel = $('rescore-manager-select');
    if (!sel || sel.dataset.populated) return;
    Object.keys(_MANAGER_AGENT_MAP).sort().forEach(m => {
      const opt = document.createElement('option');
      opt.value = m;
      opt.textContent = m;
      sel.appendChild(opt);
    });
    sel.dataset.populated = '1';
  }

  // ── Generic Written Comm re-scorer ────────────────────────────────────────
  // Reads the manager from #rescore-manager-select.
  // Value "__ALL__" → score every Written Comm session in the DB.
  // Any other value  → score only that manager's agents.
  async function reScoreWrittenComm() {
    if (typeof SpeechEngine === 'undefined') {
      toast('SpeechEngine not loaded — cannot re-score', 'error'); return;
    }

    const sel         = $('rescore-manager-select');
    const agentInput  = $('rescore-agent-names');
    const managerName = sel ? sel.value : '';

    // Parse specific agent names if provided (comma-separated)
    const rawAgentStr = (agentInput ? agentInput.value : '').trim();
    const specificNames = rawAgentStr
      ? rawAgentStr.split(',').map(n => n.trim().toLowerCase()).filter(Boolean)
      : [];

    // If specific names are entered, skip team validation — target those agents directly
    // If no specific names, a team must be selected
    if (!specificNames.length && !managerName) {
      toast('Select a team or enter specific agent names first', 'warning');
      return;
    }

    const isAll = managerName === '__ALL__';

    // Build team set when no specific names given
    let teamSet = null; // null = match everything (All Teams mode)
    if (!specificNames.length && !isAll) {
      const agents = _MANAGER_AGENT_MAP[managerName] || [];
      if (!agents.length) { toast(`No agents found for "${managerName}"`, 'error'); return; }
      teamSet = new Set(agents.map(n => n.toLowerCase().trim()));
    }

    // Fuzzy match helper — checks against specificNames first, then teamSet
    function matchesTarget(name) {
      if (!name) return false;
      const n = name.toLowerCase().trim();
      if (specificNames.length) {
        // Specific-names mode: check if this session's trainee matches any of the given names
        return specificNames.some(target => n.includes(target) || target.includes(n));
      }
      if (!teamSet) return true; // All Teams
      if (teamSet.has(n)) return true;
      for (const m of teamSet) {
        if (m.includes(n) || n.includes(m)) return true;
      }
      return false;
    }

    const btn   = $('btn-rescore-wc');
    const label = specificNames.length
      ? specificNames.map(n => n.split(' ').map(w => w[0].toUpperCase() + w.slice(1)).join(' ')).join(', ')
      : (isAll ? 'All Teams' : managerName);

    if (btn) { btn.disabled = true; btn.textContent = '⌛ Re-scoring…'; }
    if (sel) sel.disabled = true;
    if (agentInput) agentInput.disabled = true;

    try {
      const allSessions = await DB.getAll('sessions');
      const targets = allSessions.filter(s =>
        s.module === 'written-comm' &&
        matchesTarget(s.traineeName)
      );

      if (!targets.length) {
        toast(`No Written Comm sessions found for: ${label}`, 'warning');
        return;
      }

      let done = 0, updated = 0;
      const errors = [];

      for (const session of targets) {
        if (btn) btn.textContent = `⌛ ${done + 1}/${targets.length}`;
        try {
          const duration     = session.timeTaken || 0;
          const textToScore  = session.transcript || session.writtenText || '';
          let newAiScores = null;

          if (textToScore.trim().length > 0) {
            newAiScores = SpeechEngine.scoreWriting(textToScore, duration, session.topicTitle);
            newAiScores._summary = SpeechEngine.generateCoachingSummary('written-comm', newAiScores);
            newAiScores._method = 'js-rescore';
          }

          if (newAiScores && session.id) {
            // Preserve original scores as _prev (only first time — never overwrite the original)
            if (session.aiScores && !session.aiScores._prev) {
              newAiScores._prev = session.aiScores;
            } else if (session.aiScores && session.aiScores._prev) {
              newAiScores._prev = session.aiScores._prev;
            }
            // patch — only writes ai_scores, never touches admin_scores
            await DB.patch('sessions', session.id, { aiScores: newAiScores });
            updated++;
          } else if (!session.id) {
            errors.push(`${session.traineeName}: missing session ID`);
          }
        } catch (e) {
          errors.push(`${session.traineeName}: ${e.message}`);
          console.error(`Re-score failed for ${session.traineeName}:`, e);
        }
        done++;
        await new Promise(r => setTimeout(r, 100)); // small delay for UI updates
      }

      if (errors.length) {
        console.error('Re-score errors:', errors);
        toast(`${label}: ${updated} updated, ${errors.length} failed — see console`, 'warning');
      } else {
        toast(`Re-scoring complete — ${updated}/${targets.length} sessions updated (${label})`, 'success');
      }

      await loadAssessments();

    } catch (e) {
      console.error('Re-score failed:', e);
      toast('Re-score failed: ' + e.message, 'error');
    } finally {
      if (btn)        { btn.disabled = false; btn.textContent = '🔄 Re-score Written'; }
      if (sel)          sel.disabled = false;
      if (agentInput)   agentInput.disabled = false;
    }
  }

  // ── Reset Written Comm scores to pre-re-score originals ──────────────────
  async function resetWrittenScores() {
    const sel        = $('rescore-manager-select');
    const agentInput = $('rescore-agent-names');
    const managerName = sel ? sel.value : '';

    const rawAgentStr  = (agentInput ? agentInput.value : '').trim();
    const specificNames = rawAgentStr
      ? rawAgentStr.split(',').map(n => n.trim().toLowerCase()).filter(Boolean)
      : [];

    if (!specificNames.length && !managerName) {
      toast('Select a team or enter specific agent names first', 'warning');
      return;
    }

    const isAll   = managerName === '__ALL__';
    let teamSet   = null;
    if (!specificNames.length && !isAll) {
      const agents = _MANAGER_AGENT_MAP[managerName] || [];
      if (!agents.length) { toast(`No agents found for "${managerName}"`, 'error'); return; }
      teamSet = new Set(agents.map(n => n.toLowerCase().trim()));
    }

    function matchesTarget(name) {
      if (!name) return false;
      const n = name.toLowerCase().trim();
      if (specificNames.length) return specificNames.some(t => n.includes(t) || t.includes(n));
      if (!teamSet) return true;
      if (teamSet.has(n)) return true;
      for (const m of teamSet) { if (m.includes(n) || n.includes(m)) return true; }
      return false;
    }

    const label = specificNames.length
      ? specificNames.map(n => n.split(' ').map(w => w[0].toUpperCase() + w.slice(1)).join(' ')).join(', ')
      : (isAll ? 'All Teams' : managerName);

    if (!confirm(`Reset AI scores back to original (pre-re-score) values for: ${label}?\n\nThis cannot be undone.`)) return;

    const btn = $('btn-reset-wc');
    if (btn) { btn.disabled = true; btn.textContent = '⌛ Resetting…'; }
    if (sel) sel.disabled = true;
    if (agentInput) agentInput.disabled = true;

    try {
      const allSessions = await DB.getAll('sessions');

      // Target all matching Written Comm sessions — those with _prev (backup exists) OR js-rescore method
      const targets = allSessions.filter(s =>
        s.module === 'written-comm' &&
        matchesTarget(s.traineeName) &&
        s.aiScores &&
        (s.aiScores._prev || s.aiScores._method === 'js-rescore')
      );

      if (!targets.length) {
        toast(`No re-scored Written Comm sessions found for: ${label} — nothing to reset`, 'warning');
        return;
      }

      let done = 0, restored = 0;
      const errors = [];
      for (const session of targets) {
        if (btn) btn.textContent = `⌛ ${done + 1}/${targets.length}`;
        try {
          let restoredScores = null;

          if (session.aiScores._prev) {
            // Backup exists — restore directly (strip _prev so it's a clean object)
            const { _prev, ...originalScores } = session.aiScores._prev;
            restoredScores = originalScores;
          } else if (session.transcript || session.writtenText) {
            // No backup — re-score with standard SpeechEngine.scoreWriting
            const duration  = session.timeTaken || 0;
            restoredScores  = SpeechEngine.scoreWriting(session.transcript || session.writtenText || '', duration, session.topicTitle);
            restoredScores._summary = SpeechEngine.generateCoachingSummary('written-comm', restoredScores);
          }

          if (restoredScores && session.id) {
            await DB.patch('sessions', session.id, { aiScores: restoredScores });
            restored++;
          }
        } catch (e) {
          errors.push(`${session.traineeName}: ${e.message}`);
          console.error(`Reset failed for ${session.traineeName}:`, e);
        }
        done++;
        await new Promise(r => setTimeout(r, 80)); // small UI tick
      }

      if (errors.length) {
        console.error('Reset errors:', errors);
        toast(`${label}: ${restored} restored, ${errors.length} failed — see console`, 'warning');
      } else {
        toast(`Scores reset — ${restored}/${targets.length} sessions restored (${label})`, 'success');
      }

      await loadAssessments();

    } catch (e) {
      console.error('Reset failed:', e);
      toast('Reset failed: ' + e.message, 'error');
    } finally {
      if (btn)        { btn.disabled = false; btn.textContent = '↩ Reset Scores'; }
      if (sel)          sel.disabled = false;
      if (agentInput)   agentInput.disabled = false;
    }
  }

  // ── Manager Assessments ──────────────────────────────────────────
  let _mgrSessions = [];
  let _currentFilteredMgrSessions = []; // tracks the currently-rendered/filtered
                                        // view, for Export Excel / Download All
                                        // Recordings below (2026-09-20)

  async function loadMgrAssessments() {
    try {
      const all = await DB.getAll('sessions');
      _mgrSessions = all.filter(s => s.module && s.module.startsWith('mgr-'));
      renderMgrAssessments();
      // Update badge
      const pending = _mgrSessions.filter(s => !s.adminScores).length;
      const badge = document.getElementById('mgr-pending-badge');
      if (badge) badge.textContent = pending > 0 ? pending : '0';
    } catch (e) {
      console.error('loadMgrAssessments error:', e);
    }
  }

  function renderMgrAssessments() {
    const moduleFilter = document.getElementById('mgr-filter-module') ? document.getElementById('mgr-filter-module').value : 'all';
    const statusFilter = document.getElementById('mgr-filter-status') ? document.getElementById('mgr-filter-status').value : 'all';

    let sessions = _mgrSessions;
    if (moduleFilter !== 'all') sessions = sessions.filter(s => s.module === moduleFilter);
    if (statusFilter === 'pending') sessions = sessions.filter(s => !s.adminScores);
    if (statusFilter === 'scored')  sessions = sessions.filter(s =>  s.adminScores);

    const tbody = document.getElementById('mgr-assessments-tbody');
    if (!tbody) return;

    if (!sessions.length) {
      _currentFilteredMgrSessions = [];
      tbody.innerHTML = '<tr><td colspan="9" class="empty-state">No manager assessments yet.</td></tr>';
      return;
    }

    const MGR_MODULE_LABELS = {
      'mgr-situation-room':     '🎯 Situation Room',
      'mgr-transcript-autopsy': '📋 Transcript Autopsy',
      'mgr-mock-call':          '📞 Mock Call',
      'mgr-feedback':           '💬 Feedback',
      'mgr-eq':                 '🧠 Emotional Intelligence',
      'mgr-listening-tone':     '🎧 Listening & Tone',
      'mgr-management-skills':  '📊 Management Skills',
      'mgr-nri-situation-room':     '🌏 NRI Situation Room',
      'mgr-nri-transcript-autopsy': '🌏 NRI Transcript Autopsy',
      'mgr-nri-mock-call':          '🌏 NRI Paper Trade',
    };

    // Sort newest first
    const sorted = [...sessions].sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
    _currentFilteredMgrSessions = sorted; // for exportMgrAssessmentsExcel / downloadAllMgrRecordings

    // Drop any selected id that's no longer in the filtered view (e.g. the
    // module/status filter changed), same as the trainee table does.
    const visibleIds = new Set(sorted.map(s => s.id));
    [..._selectedMgrSessionIds].forEach(id => { if (!visibleIds.has(id)) _selectedMgrSessionIds.delete(id); });
    _updateMgrSessionActionBtns();

    tbody.innerHTML = sorted.map(s => {
      const aiScore    = s.aiScores    && s.aiScores.overall    != null ? s.aiScores.overall    + '%' : '—';
      const adminScore = s.adminScores && s.adminScores.overall != null ? s.adminScores.overall + '%' : '—';
      const status     = s.adminScores
        ? '<span class="badge badge-scored">Scored</span>'
        : '<span class="badge badge-pending">Pending</span>';
      const date = s.submittedAt
        ? new Date(s.submittedAt).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })
        : '—';
      const topicDisplay = (s.topicTitle || '—').replace(/'/g, '&#39;');
      const nameForDelete = (s.traineeName || 'this manager').replace(/'/g, "\\'");
      const mgrExt = (s.recordingUrl || '').includes('.mp4') ? 'mp4' : (s.recordingUrl || '').includes('.ogg') ? 'ogg' : 'webm';
      const mgrDlFilename = `${(s.traineeName || 'recording').replace(/\s+/g, '_')}-${s.module}-${(s.submittedAt || '').slice(0, 10)}.${mgrExt}`;
      const mgrDlBtn = s.recordingUrl
        ? `<button class="btn-small" onclick="Admin.downloadRecording('${s.recordingUrl}', '${mgrDlFilename}')">⬇ Recording</button>`
        : '<span style="color:var(--text-muted)">—</span>';
      const checked = _selectedMgrSessionIds.has(s.id) ? 'checked' : '';
      return `<tr>
        <td style="text-align:center">
          <input type="checkbox" class="mgr-session-cb" ${checked}
            onchange="Admin.toggleMgrSessionCheckbox('${s.id}', this.checked)" />
        </td>
        <td><strong>${s.traineeName || '—'}</strong></td>
        <td>${MGR_MODULE_LABELS[s.module] || s.module}</td>
        <td style="max-width:200px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${topicDisplay}">${s.topicTitle || '—'}</td>
        <td>${date}</td>
        <td>${status}</td>
        <td>${aiScore}</td>
        <td>${adminScore}</td>
        <td>${mgrDlBtn}</td>
        <td style="white-space:nowrap">
          <button class="btn-ghost" style="font-size:0.8rem;padding:0.35rem 0.75rem"
            onclick="Admin.openMgrScoreModal('${s.id}')">Score</button>
          <button onclick="Admin.deleteSingleMgrSession('${s.id}', '${nameForDelete}')" title="Delete"
            style="background:none;border:none;cursor:pointer;font-size:1rem;padding:0.2rem;margin-left:0.3rem">🗑</button>
        </td>
      </tr>`;
    }).join('');
  }

  // Manager Assessments had no bulk-select/delete at all -- every row's
  // trash icon only ever deleted one session at a time, unlike Trainees
  // (_selectedTraineeIds/deleteSelectedTrainees) and the trainee Assessments
  // tab (_selectedSessionIds/archiveSelectedSessions), which both already
  // have a header checkbox + "select all" + bulk action. Same pattern here.
  function toggleMgrSessionCheckbox(id, checked) {
    if (checked) _selectedMgrSessionIds.add(id);
    else _selectedMgrSessionIds.delete(id);
    _updateMgrSessionActionBtns();
    const allCb = $('select-all-mgr-sessions');
    if (allCb && _currentFilteredMgrSessions.length > 0) {
      const n = _selectedMgrSessionIds.size;
      allCb.indeterminate = n > 0 && n < _currentFilteredMgrSessions.length;
      allCb.checked = n === _currentFilteredMgrSessions.length;
    }
  }

  function toggleAllMgrSessions(checked) {
    if (checked) _currentFilteredMgrSessions.forEach(s => _selectedMgrSessionIds.add(s.id));
    else _currentFilteredMgrSessions.forEach(s => _selectedMgrSessionIds.delete(s.id));
    document.querySelectorAll('.mgr-session-cb').forEach(cb => { cb.checked = checked; });
    _updateMgrSessionActionBtns();
  }

  function _updateMgrSessionActionBtns() {
    const btn = $('btn-delete-selected-mgr-sessions');
    if (!btn) return;
    const n = _selectedMgrSessionIds.size;
    btn.disabled = n === 0;
    btn.textContent = n > 0 ? `🗑 Delete Selected (${n})` : '🗑 Delete Selected';
  }

  async function deleteSelectedMgrSessions() {
    const n = _selectedMgrSessionIds.size;
    if (!n) return;
    const names = _currentFilteredMgrSessions
      .filter(s => _selectedMgrSessionIds.has(s.id))
      .map(s => s.traineeName || 'Unknown')
      .join(', ');
    if (!confirm(`Delete ${n} selected manager assessment(s)?\n\n${names}\n\nThis action cannot be undone.`)) return;
    let failed = 0;
    for (const id of [..._selectedMgrSessionIds]) {
      try { await DB.del('sessions', id); } catch (e) { console.error('Delete mgr session failed:', id, e); failed++; }
    }
    _selectedMgrSessionIds.clear();
    toast(failed ? `Deleted ${n - failed} of ${n} assessment(s) — ${failed} failed.` : `Deleted ${n} assessment(s).`, failed ? 'error' : 'success');
    await loadMgrAssessments();
  }

  // Manager Assessments tab had no way to remove a submitted assessment --
  // every other assessment-like section (Trainees, AI Audit Score) already
  // has a delete option, this one just never got one. Deletes the
  // underlying `sessions` row directly via DB.del, same as
  // deleteSelectedTrainees() does for the `trainees` store -- no cascading
  // cleanup of the recording in Supabase Storage, matching that pattern.
  async function deleteSingleMgrSession(id, name) {
    if (!confirm(`Delete this manager assessment for "${name}"?\n\nThis action cannot be undone.`)) return;
    try {
      await DB.del('sessions', id);
      _mgrSessions = _mgrSessions.filter(s => s.id !== id);
      renderMgrAssessments();
      const pending = _mgrSessions.filter(s => !s.adminScores).length;
      const badge = document.getElementById('mgr-pending-badge');
      if (badge) badge.textContent = pending > 0 ? pending : '0';
      toast(`Deleted assessment for ${name}.`, 'success');
    } catch (e) {
      toast('Delete failed: ' + e.message, 'error');
    }
  }

  // Manager Assessments tab had no Export Excel / Download recordings
  // options -- every other assessment-like section already has them, this
  // one just never got them. Mirrors exportAssessmentsExcel() /
  // downloadAllRecordings() above: reads whatever's currently filtered/
  // rendered in the tab (module + status filters), not every session ever
  // recorded. (added 2026-09-20)
  function exportMgrAssessmentsExcel() {
    const sessions = _currentFilteredMgrSessions || [];
    if (!sessions.length) { toast('No manager assessments in the current view to export.', 'error'); return; }
    if (typeof XLSX === 'undefined') { toast('Excel library not loaded — try refreshing the page.', 'error'); return; }

    const rows = sessions.map(s => {
      const aiScore    = s.aiScores    && s.aiScores.overall    != null ? s.aiScores.overall    : null;
      const adminScore = s.adminScores && s.adminScores.overall != null ? s.adminScores.overall : null;
      return {
        'Manager':       s.traineeName || '',
        'Module':        s.module || '',
        'Topic':         s.topicTitle || '',
        'Date':          formatDate(s.submittedAt).split(' ')[0],
        'Status':        s.adminScores ? 'Scored' : (s.status || ''),
        'AI Score':      aiScore    != null ? aiScore    : '',
        'Admin Score':   adminScore != null ? adminScore : '',
        'Has Recording': s.recordingUrl ? 'Yes' : 'No',
      };
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{ wch: 20 }, { wch: 22 }, { wch: 30 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 12 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Manager Assessments');
    const filename = `manager_assessments_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, filename);
    toast(`Exported ${rows.length} manager assessment(s) to ${filename}`, 'success');
  }

  async function downloadAllMgrRecordings() {
    const sessions = (_currentFilteredMgrSessions || []).filter(s => s.recordingUrl);
    if (!sessions.length) { toast('No recordings in the current view to download.', 'error'); return; }
    if (typeof JSZip === 'undefined') { toast('ZIP library not loaded — try refreshing the page.', 'error'); return; }

    toast(`Zipping ${sessions.length} recording(s)... this may take a moment.`, '');
    const zip = new JSZip();
    let ok = 0, failed = 0;
    for (const s of sessions) {
      try {
        const resp = await fetch(s.recordingUrl);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const blob = await resp.blob();
        const ext = s.recordingUrl.includes('.mp4') ? 'mp4' : s.recordingUrl.includes('.ogg') ? 'ogg' : 'webm';
        const safeName = (s.traineeName || 'unknown').replace(/[^\w\- ]/g, '').trim().replace(/\s+/g, '_') || 'unknown';
        const dateStr = (s.submittedAt || '').slice(0, 10);
        let filename = `${safeName}-${s.module || 'session'}-${dateStr}.${ext}`;
        if (zip.file(filename)) filename = `${safeName}-${s.module || 'session'}-${dateStr}-${s.id.slice(0, 6)}.${ext}`;
        zip.file(filename, blob);
        ok++;
      } catch (e) {
        console.warn('Manager recording download failed for session', s.id, e.message);
        failed++;
      }
    }
    if (ok === 0) { toast('Could not download any recordings — check your connection and try again.', 'error'); return; }

    const content = await zip.generateAsync({ type: 'blob' });
    const objUrl = URL.createObjectURL(content);
    const a = document.createElement('a');
    a.href = objUrl;
    a.download = `manager_recordings_${new Date().toISOString().slice(0, 10)}.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(objUrl), 4000);
    toast(`Downloaded ${ok} recording(s)${failed ? ` (${failed} could not be fetched)` : ''} as a ZIP.`, failed ? '' : 'success');
  }

  async function openMgrScoreModal(sessionId) {
    const session = _mgrSessions.find(s => s.id === sessionId);
    if (!session) return;

    const modal = document.getElementById('mgr-score-modal');
    if (!modal) return;

    modal.querySelector('#mgr-modal-name').textContent    = session.traineeName || '—';
    modal.querySelector('#mgr-modal-module').textContent  = (session.module || '').replace('mgr-','').replace(/-/g,' ');
    modal.querySelector('#mgr-modal-topic').textContent   = session.topicTitle  || '—';

    const isMcq     = session.module === 'mgr-listening-tone';
    const modBase   = _baseMod(session.module);
    const isSR      = modBase === 'mgr-situation-room';
    // 'mgr-eq' (The Mirror Room) removed from this list 2026-09-20: it
    // moved from a typed response (writtenText) to a conversational-AI
    // transcript (session.transcript), same shape as Feedback/Red Pen --
    // it used to render as "(no text)" here since writtenText is now
    // always saved empty for this module. It now falls through to the
    // generic transcript branch at the bottom of this if/else, same as
    // Feedback.
    const isWritten = ['mgr-transcript-autopsy','mgr-management-skills'].includes(modBase);
    const isFeedback = session.module === 'mgr-feedback';
    const isEq       = session.module === 'mgr-eq';
    const isAudio    = modBase === 'mgr-mock-call';

    // Recording playback — Mock Call, Feedback (Red Pen), and now Mirror
    // Room all capture a voice recording (see manager-app.js _submitAudio /
    // _finishFeedbackConversation / _finishEqConversation), but this modal
    // previously only ever rendered the text transcript, so admins had no
    // way to actually listen to the call. Show the player whenever a
    // recording URL made it through (DB.put uploads recordingBlob to
    // Supabase Storage and maps it back as session.recordingUrl).
    const audioSection = modal.querySelector('#mgr-modal-audio-section');
    const audioEl       = modal.querySelector('#mgr-modal-audio');
    const hasRecording  = (isAudio || isFeedback || isEq) && !!session.recordingUrl;
    if (audioSection) audioSection.classList.toggle('hidden', !hasRecording);
    if (audioEl) {
      if (hasRecording) audioEl.src = session.recordingUrl;
      else { audioEl.removeAttribute('src'); audioEl.load && audioEl.load(); }
    }

    const transcriptBox = modal.querySelector('#mgr-modal-transcript');

    if (isSR) {
      // Two-section Situation Room — writtenText is a JSON blob
      let srData = null;
      try { srData = JSON.parse(session.writtenText || 'null'); } catch (_) {}
      if (srData) {
        const secA = srData.sectionA || {};
        const secB = srData.sectionB || {};
        const esc  = t => (t || '').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        // Situation Room scenarios are hardcoded client-side and never
        // persisted to the DB topics table, so this saved session is the
        // only place the admin can see which distinct scenario grounds
        // this Section A / Section B pair -- without it, both sections
        // look like generic, context-free text boxes regardless of which
        // scenario the manager was actually given.
        const situationHTML = srData.scenario
          ? '<div style="margin-bottom:1rem">' +
              '<div style="font-size:0.72rem;font-weight:800;letter-spacing:0.06em;color:#334155;margin-bottom:0.4rem">SITUATION</div>' +
              '<div style="white-space:pre-wrap;font-size:0.85rem;background:#f8fafc;padding:0.75rem;border-radius:6px;border-left:3px solid #64748b">' + esc(srData.scenario) + '</div>' +
            '</div>'
          : '';
        const internalHTML = srData.internalData
          ? '<div style="margin-bottom:1rem">' +
              '<div style="font-size:0.72rem;font-weight:800;letter-spacing:0.06em;color:#0f766e;margin-bottom:0.4rem">INTERNAL DATA (shown to the manager)</div>' +
              '<div style="white-space:pre-wrap;font-size:0.82rem;background:#f0fdfa;padding:0.75rem;border-radius:6px;border-left:3px solid #0d9488">' + esc(srData.internalData) + '</div>' +
            '</div>'
          : '';
        transcriptBox.innerHTML =
          situationHTML +
          internalHTML +
          '<div style="margin-bottom:1rem">' +
            '<div style="font-size:0.72rem;font-weight:800;letter-spacing:0.06em;color:#7c3aed;margin-bottom:0.4rem">SECTION A — WHAT WOULD YOU SAY?</div>' +
            '<div style="font-size:0.8rem;color:#666;margin-bottom:0.3rem"><em>Prompt: ' + esc(secA.prompt) + '</em></div>' +
            '<div style="white-space:pre-wrap;font-size:0.88rem;background:#f5f3ff;padding:0.75rem;border-radius:6px;border-left:3px solid #7c3aed">' + esc(secA.response || '(no response)') + '</div>' +
          '</div>' +
          '<div>' +
            '<div style="font-size:0.72rem;font-weight:800;letter-spacing:0.06em;color:#dc2626;margin-bottom:0.4rem">SECTION B — THE WRONG RESPONSE ANALYSIS</div>' +
            '<div style="font-size:0.75rem;font-weight:700;color:#666;margin-bottom:0.2rem">The Flawed Response (given to the manager to critique):</div>' +
            '<div style="white-space:pre-wrap;font-size:0.88rem;background:#f1f5f9;padding:0.75rem;border-radius:6px;border-left:3px solid #94a3b8;margin-bottom:0.5rem">' + esc(secB.wrongResponse || '(not recorded)') + '</div>' +
            '<div style="font-size:0.75rem;font-weight:700;color:#666;margin:0.5rem 0 0.2rem">Errors Identified:</div>' +
            '<div style="white-space:pre-wrap;font-size:0.88rem;background:#fef2f2;padding:0.75rem;border-radius:6px;border-left:3px solid #dc2626;margin-bottom:0.5rem">' + esc(secB.errors || '(none)') + '</div>' +
            '<div style="font-size:0.75rem;font-weight:700;color:#666;margin-bottom:0.2rem">Why Each Error Made It Worse:</div>' +
            '<div style="white-space:pre-wrap;font-size:0.88rem;background:#fffbeb;padding:0.75rem;border-radius:6px;border-left:3px solid #f59e0b' + (secB.rewrite ? ';margin-bottom:0.5rem' : '') + '">' + esc(secB.impact || '(none)') + '</div>' +
            // Older sessions (before the rewrite field was removed from
            // Part B) may still have a saved rewrite -- keep showing it for
            // those so past submissions don't lose data, just don't ask for
            // one on new submissions.
            (secB.rewrite
              ? '<div style="font-size:0.75rem;font-weight:700;color:#666;margin-bottom:0.2rem">Rewrite:</div>' +
                '<div style="white-space:pre-wrap;font-size:0.88rem;background:#f0fdf4;padding:0.75rem;border-radius:6px;border-left:3px solid #10b981">' + esc(secB.rewrite) + '</div>'
              : '') +
          '</div>';
      } else {
        transcriptBox.innerHTML = '<div style="color:var(--text-muted);font-style:italic">No response data found.</div>';
      }
    } else if (isWritten) {
      transcriptBox.innerHTML = '<strong>Written Response:</strong><div style="white-space:pre-wrap;margin-top:0.5rem;font-size:0.9rem;max-height:240px;overflow-y:auto">' +
        (session.writtenText || '(no text)').replace(/</g,'&lt;') + '</div>';
    } else if (isMcq) {
      const ai = session.aiScores || {};
      transcriptBox.innerHTML = '<strong>Auto-Score:</strong> ' + (ai.correct || 0) + '/' + (ai.total || 5) + ' correct — ' + (ai.overall || 0) + '%';
    } else {
      transcriptBox.innerHTML = '<strong>Transcript:</strong><div style="white-space:pre-wrap;margin-top:0.5rem;font-size:0.9rem;max-height:200px;overflow-y:auto">' +
        (session.transcript || '(no transcript)').replace(/</g,'&lt;') + '</div>';
    }

    // Shared evaluation criteria (js/mgr-eval-criteria.js) for the 5 doc
    // modules — same parameter keys/weights the AI evaluator and the
    // manager-facing "how this is scored" panel use. Falls back to the old
    // generic 1-5 labels for any module the doc doesn't cover (currently
    // just mgr-management-skills).
    const evalCriteria = (typeof MGR_EVAL_CRITERIA !== 'undefined') ? MGR_EVAL_CRITERIA[session.module] : null;

    // AI scores display
    const aiBox = modal.querySelector('#mgr-modal-ai-scores');
    if (session.aiScores && session.aiScores.overall != null) {
      if (evalCriteria) {
        const ai = session.aiScores;
        aiBox.innerHTML =
          '<strong>AI Score: ' + ai.overall + '%' + (ai.earnedMarks != null ? ' (' + ai.earnedMarks + '/' + (ai.maxMarks || evalCriteria.maxMarks) + ')' : '') + '</strong>' +
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:0.3rem;margin-top:0.5rem;font-size:0.8rem">' +
            evalCriteria.parameters.map(p => {
              const v = ai[p.key];
              return '<span>' + p.label + ': <strong>' + (v != null ? v + '%' : '—') + '</strong></span>';
            }).join('') +
          '</div>' +
          (ai.flag ? '<div style="margin-top:0.4rem;font-size:0.78rem;color:#92400e;background:#fef9c3;padding:0.4rem 0.6rem;border-radius:4px">⚠ ' + ai.flag + '</div>' : '') +
          // Situation Room's two-phase eval attaches narrative feedback
          // separately from the flat parameter scores above.
          (ai._sectionAFeedback && ai._sectionAFeedback.whatNotToSay && !/clean/i.test(ai._sectionAFeedback.whatNotToSay)
            ? '<div style="margin-top:0.4rem;font-size:0.78rem;color:#92400e;background:#fef9c3;padding:0.4rem 0.6rem;border-radius:4px">⚠ <strong>Risky language (A):</strong> ' + ai._sectionAFeedback.whatNotToSay + '</div>' : '') +
          (ai._sectionAFeedback && ai._sectionAFeedback.missedPoints && !/nothing significant/i.test(ai._sectionAFeedback.missedPoints)
            ? '<div style="margin-top:0.3rem;font-size:0.78rem;color:#92400e;background:#fef9c3;padding:0.4rem 0.6rem;border-radius:4px">📝 <strong>Missed error (A):</strong> ' + ai._sectionAFeedback.missedPoints + '</div>' : '') +
          (ai._sectionBFeedback && ai._sectionBFeedback.keyMissed && !/all key/i.test(ai._sectionBFeedback.keyMissed)
            ? '<div style="margin-top:0.3rem;font-size:0.78rem;color:#92400e;background:#fef9c3;padding:0.4rem 0.6rem;border-radius:4px">📝 <strong>Missed error (B):</strong> ' + ai._sectionBFeedback.keyMissed + '</div>' : '') +
          // Per-parameter reasons from the AI evaluator, where present.
          (ai._reasons && Object.keys(ai._reasons).length
            ? '<details style="margin-top:0.5rem"><summary style="cursor:pointer;font-size:0.78rem;color:var(--text-muted)">AI reasoning per parameter</summary>' +
                '<ul style="font-size:0.76rem;color:var(--text-muted);margin:0.4rem 0 0 1.1rem;padding:0">' +
                  Object.keys(ai._reasons).map(k => {
                    const param = evalCriteria.parameters.find(pp => pp.key === k);
                    return '<li style="margin-bottom:0.25rem"><strong>' + (param ? param.label : k) + ':</strong> ' + ai._reasons[k] + '</li>';
                  }).join('') +
                '</ul></details>'
            : '');
      } else {
        aiBox.innerHTML = '<strong>AI Score: ' + session.aiScores.overall + '%</strong>';
      }
    } else {
      aiBox.innerHTML = '';
    }

    // Scoring criteria inputs
    const criteriaEl = modal.querySelector('#mgr-scoring-criteria');
    const existing = session.adminScores || {};
    const ai       = session.aiScores    || {}; // used to pre-fill the 1-5 sliders below (bugfix 2026-09-20: was undefined here, threw and silently aborted the whole modal before it could open)

    if (isMcq) {
      criteriaEl.innerHTML = '<p style="color:var(--text-muted);font-size:0.9rem">This is an auto-scored MCQ assessment. You may add a comment below.</p>';
    } else if (evalCriteria) {
      // Changed 2026-09-20 from a "type a 0-100% number" input to a 1-5
      // slider per parameter -- the same quick, easy-to-use control the
      // trainee Assessments tab already uses for Mock Call scoring (see
      // _renderScoringCriteria() / .criterion-slider above). The 1-5 value
      // is converted to this parameter's 0-100%-of-weight internally on
      // save (see saveMgrScore()), so earnedMarks/maxMarks/overall and
      // every dashboard/export reading adminScores keep working exactly as
      // before -- only the admin's input control changed, not what gets
      // stored. Pre-fills from a previous admin score if one exists,
      // otherwise from the AI's suggestion (also converted to 1-5), same
      // precedence the trainee modal uses.
      const maxMarks = evalCriteria.maxMarks || 50;
      const toFive = (pct) => Math.min(5, Math.max(1, Math.round((pct / 20) * 2) / 2));
      criteriaEl.innerHTML =
        '<div style="font-size:0.78rem;color:var(--text-muted);margin-bottom:0.6rem">Score each parameter 1–5, just like Mock Call scoring. Total: <strong>' + maxMarks + ' marks</strong>.</div>' +
        evalCriteria.parameters.map(p => {
          const existingPct = existing[p.key];
          const aiPct       = ai[p.key];
          const val = existingPct != null ? toFive(existingPct)
                    : aiPct       != null ? toFive(aiPct)
                    : 3;
          return '<div class="criterion-row" data-key="' + p.key + '">' +
              '<div class="criterion-label"><span>' + p.label + ' <span style="font-weight:400;color:var(--text-muted)">(weight ' + p.weight + ')</span></span>' +
                '<span class="criterion-val" data-val-for="' + p.key + '">' + val + '</span></div>' +
              '<div class="criterion-desc">' + p.desc + '</div>' +
              '<input type="range" min="1" max="5" step="0.5" value="' + val + '" class="criterion-slider mgr-criteria-slider" data-key="' + p.key + '" data-weight="' + p.weight + '" />' +
            '</div>';
        }).join('') +
        (Array.isArray(MGR_EVAL_SCORING_NOTES) && MGR_EVAL_SCORING_NOTES.length
          ? '<details style="margin-top:0.5rem"><summary style="cursor:pointer;font-size:0.8rem;color:var(--text-muted)">Scoring guidance</summary>' +
              '<ul style="font-size:0.78rem;color:var(--text-muted);margin:0.4rem 0 0 1.1rem;padding:0">' +
                MGR_EVAL_SCORING_NOTES.map(n => '<li style="margin-bottom:0.3rem">' + n + '</li>').join('') +
              '</ul></details>'
          : '');
      criteriaEl.querySelectorAll('.mgr-criteria-slider').forEach(sl => {
        sl.addEventListener('input', () => {
          const out = criteriaEl.querySelector('[data-val-for="' + sl.dataset.key + '"]');
          if (out) out.textContent = sl.value;
        });
      });
    } else {
      const audioLabels   = ['Leadership Presence','Decision Quality','Communication Clarity','Empathy & EQ','Professionalism'];
      const writtenLabels = ['Content Quality','Critical Thinking','Communication Clarity','Empathy & Insight','Action Orientation'];
      const labels = isWritten ? writtenLabels : audioLabels;
      criteriaEl.innerHTML = labels.map((label, i) => {
        const key = label.toLowerCase().replace(/[^a-z]/g, '');
        const val = existing[key] != null ? existing[key] : (existing['score' + (i+1)] != null ? existing['score' + (i+1)] : '');
        return '<div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:0.5rem">' +
          '<label style="min-width:220px;font-size:0.85rem">' + label + '</label>' +
          '<input type="number" min="1" max="5" step="0.5" value="' + val + '" class="mgr-criteria-input" data-key="' + key + '" style="width:70px;border:1px solid var(--border);border-radius:6px;padding:0.35rem 0.5rem;font-size:0.9rem" />' +
          '<span style="font-size:0.8rem;color:var(--text-muted)">(1–5)</span>' +
          '</div>';
      }).join('');
    }

    modal.querySelector('#mgr-admin-comment').value = session.adminComment || '';
    modal.dataset.sessionId = sessionId;
    modal.classList.remove('hidden');
  }

  async function saveMgrScore() {
    const modal = document.getElementById('mgr-score-modal');
    if (!modal) return;
    const sessionId = modal.dataset.sessionId;
    const session = _mgrSessions.find(s => s.id === sessionId);
    if (!session) return;

    const isMcq = session.module === 'mgr-listening-tone';
    const evalCriteria = (typeof MGR_EVAL_CRITERIA !== 'undefined') ? MGR_EVAL_CRITERIA[session.module] : null;
    let adminScores = {};

    if (isMcq) {
      adminScores = Object.assign({}, session.aiScores); // MCQ: admin score = AI score
    } else if (evalCriteria) {
      // Sliders are 1-5 (see openMgrScoreModal above); convert each to this
      // parameter's 0-100%-of-weight before storing, so adminScores keeps
      // the exact same shape/meaning every other module, dashboard and
      // export already expects.
      const sliders = modal.querySelectorAll('.mgr-criteria-slider');
      let earnedMarks = 0, totalWeight = 0;
      sliders.forEach(sl => {
        const raw = parseFloat(sl.value); // 1-5
        const weight = parseFloat(sl.dataset.weight) || 0;
        totalWeight += weight;
        if (!isNaN(raw)) {
          const pct = Math.min(100, Math.max(0, (raw / 5) * 100));
          adminScores[sl.dataset.key] = parseFloat(pct.toFixed(1));
          earnedMarks += (pct / 100) * weight;
        }
      });
      adminScores.earnedMarks = parseFloat(earnedMarks.toFixed(1));
      adminScores.maxMarks = evalCriteria.maxMarks || totalWeight;
      adminScores.overall = totalWeight > 0 ? parseFloat(((earnedMarks / totalWeight) * 100).toFixed(1)) : null;
    } else {
      const inputs = modal.querySelectorAll('.mgr-criteria-input');
      let sum = 0, count = 0;
      inputs.forEach(inp => {
        const val = parseFloat(inp.value);
        if (!isNaN(val)) { adminScores[inp.dataset.key] = val; sum += val; count++; }
      });
      adminScores.overall = count > 0 ? parseFloat(((sum / (count * 5)) * 100).toFixed(1)) : null;
    }

    const comment = modal.querySelector('#mgr-admin-comment').value.trim();

    try {
      await DB.patch('sessions', sessionId, { adminScores, adminComment: comment });
      const idx = _mgrSessions.findIndex(s => s.id === sessionId);
      if (idx >= 0) {
        _mgrSessions[idx].adminScores  = adminScores;
        _mgrSessions[idx].adminComment = comment;
      }
      renderMgrAssessments();
      modal.classList.add('hidden');
      toast('Manager score saved!', 'success');
    } catch (e) {
      alert('Error saving score: ' + e.message);
    }
  }

  // ---- Seed: NRI Basics of Stock Market MCQ ----
  async function seedStockMarketMcq(silent = false) {
    const existing = await DB.getAll('topics');
    const smqTopics = existing.filter(t => t.module === 'stock-market-mcq');

    // Delete legacy topics that predate the Set 1 / Set 2 / Set 3 / Set 4 naming
    const oldTopics = smqTopics.filter(t => !t.title || (!t.title.includes('Set 1') && !t.title.includes('Set 2') && !t.title.includes('Set 3') && !t.title.includes('Set 4')));
    for (const old of oldTopics) {
      try { await DB.del('topics', old.id); } catch (_) {}
    }

    const validTopics = smqTopics.filter(t => t.title && (t.title.includes('Set 1') || t.title.includes('Set 2') || t.title.includes('Set 3') || t.title.includes('Set 4')));
    const hasSet1 = validTopics.some(t => t.title.includes('Set 1'));
    const hasSet2 = validTopics.some(t => t.title.includes('Set 2'));
    const hasSet3 = validTopics.some(t => t.title.includes('Set 3'));
    const hasSet4 = validTopics.some(t => t.title.includes('Set 4'));

    if (hasSet1 && hasSet2 && hasSet3 && hasSet4) {
      if (!silent) toast('NRI Stock Market topics already exist — no action taken.', 'info');
      return;
    }

    const set1Questions = [
      { stem: "In which year and city was Zerodha founded?", options: ["2005, Mumbai","2008, Hyderabad","2010, Bengaluru","2012, Delhi"], correct: 2, explanation: "Zerodha was founded in 2010 in Bengaluru by Nithin Kamath and Nikhil Kamath." },
      { stem: "Who are the founders of Zerodha?", options: ["Radhakishan Damani and Rakesh Jhunjhunwala","Nithin Kamath and Nikhil Kamath","Vijay Shekhar Sharma and Deepinder Goyal","Uday Kotak and Nandan Nilekani"], correct: 1, explanation: "Zerodha was founded by brothers Nithin Kamath and Nikhil Kamath." },
      { stem: "Zerodha was the first to introduce which revolutionary brokerage model in India?", options: ["Full-service broking with relationship managers","Discount broking — a flat fee of Rs. 20 per trade regardless of order size","Free broking with no charges at all","Subscription-based broking model"], correct: 1, explanation: "Zerodha pioneered discount broking — a flat Rs. 20 per trade regardless of order size." },
      { stem: "What was the major technological breakthrough that set Zerodha apart from traditional brokers?", options: ["Launching India's first mutual fund platform","Introducing phone-based trading","Launching Kite — a modern, fast, and lightweight trading platform","Launching a dedicated commodity exchange"], correct: 2, explanation: "Zerodha's Kite platform is widely regarded as a game-changer — fast, modern, and built in-house." },
      { stem: "Zerodha grew entirely without external funding. This means it is a:", options: ["Government-owned enterprise","Venture capital-backed startup","Bootstrapped company — funded only by the founders and internal profits","Listed public company on NSE"], correct: 2, explanation: "Zerodha is bootstrapped — it has never raised external venture capital." },
      { stem: "Which stock exchange was established in 1875 and is Asia's oldest exchange?", options: ["NSE","MCX","BSE","NCDEX"], correct: 2, explanation: "BSE (Bombay Stock Exchange), established in 1875, is Asia's oldest stock exchange." },
      { stem: "What is the benchmark index of the NSE (National Stock Exchange)?", options: ["S&P BSE Sensex","Nifty 50","Nifty Bank","BSE 500"], correct: 1, explanation: "The Nifty 50 is the flagship index of the NSE, tracking the top 50 companies." },
      { stem: "The S&P BSE Sensex tracks how many stocks?", options: ["50","100","30","200"], correct: 2, explanation: "The BSE Sensex tracks 30 of the largest and most actively traded stocks on the BSE." },
      { stem: "NSE was established in which year and pioneered which capability?", options: ["1985, screen-based trading","1992, automated trading","1994, online trading","2000, algorithmic trading"], correct: 1, explanation: "NSE was established in 1992 and pioneered automated electronic trading in India." },
      { stem: "In the IPO process, who is appointed as the lead manager?", options: ["SEBI","Stock Broker","Merchant Banker","Clearing Corporation"], correct: 2, explanation: "A Merchant Banker is appointed as the lead manager to manage the IPO process end-to-end." },
      { stem: "What does DRHP stand for in the context of an IPO?", options: ["Direct Registered Holding Prospectus","Draft Red Herring Prospectus","Demat Registration and Holding Paper","Direct Rights and Holdings Proposal"], correct: 1, explanation: "DRHP stands for Draft Red Herring Prospectus — the preliminary IPO document filed with SEBI." },
      { stem: "SEBI's role during its review of the DRHP is best described as:", options: ["Setting the IPO price","Vetting the financials of the company","Checking for full and fair disclosure only","Allocating shares to investors"], correct: 2, explanation: "SEBI checks that the DRHP provides full and fair disclosure — it does not verify financial accuracy." },
      { stem: "The final document filed with the exchange that includes the price band is called:", options: ["DRHP","Prospectus Summary","Red Herring Prospectus (RHP)","Allotment Letter"], correct: 2, explanation: "The Red Herring Prospectus (RHP) is the final version of the IPO document, including the price band." },
      { stem: "During the IPO live bidding phase, which mechanism blocks funds in an investor's bank account?", options: ["DDPI","eDIS","UPI-linked ASBA","TPIN"], correct: 2, explanation: "UPI-linked ASBA (Application Supported by Blocked Amount) blocks funds during IPO bidding." },
      { stem: "For retail investors in an IPO, the allotment process is done via:", options: ["First come, first served","Proportional allotment","Lottery","Auction bidding"], correct: 2, explanation: "Retail IPO allotment is done via lottery when oversubscribed, ensuring fairness." },
      { stem: "In the Secondary Market, when shares are traded between two investors, the company:", options: ["Receives a transaction fee","Issues new shares each time","Gets no money — only investors exchange ownership","Must approve each transaction"], correct: 2, explanation: "In the secondary market, only ownership transfers between investors — the company receives nothing." },
      { stem: "What drives share price changes in the secondary market on a second-by-second basis?", options: ["SEBI directives","Company announcements only","Supply and demand — more buyers raises price, more sellers lowers price","Fixed periodic auctions"], correct: 2, explanation: "Share prices are driven purely by supply and demand dynamics in the secondary market." },
      { stem: "SEBI stands for:", options: ["Stock Exchange Board of India","Securities and Exchange Board of India","Securities and Equity Bureau of India","Stock Equity and Brokerage Institution"], correct: 1, explanation: "SEBI — Securities and Exchange Board of India — is the regulator of the Indian securities market." },
      { stem: "Which exchanges fall under SEBI's purview for Equities and Derivatives in India?", options: ["MCX and NCDEX","NSE and BSE","BSE and MCX","NSE and NCDEX"], correct: 1, explanation: "NSE and BSE are the two main exchanges for equities and derivatives, both regulated by SEBI." },
      { stem: "MCX and NCDEX are specialized exchanges dealing in which market segment?", options: ["Equities","Government bonds","Commodities","Currency derivatives"], correct: 2, explanation: "MCX and NCDEX are commodity exchanges dealing in metals, energy, and agricultural products." },
      { stem: "Stock Brokers are described as which Pillar of financial intermediaries?", options: ["Pillar 1 – The Gateway","Pillar 2 – The Record Keepers","Pillar 3 – The Guarantors","Pillar 4 – The Regulators"], correct: 0, explanation: "Stock Brokers are Pillar 1 — The Gateway — as they are the entry point for investors to the market." },
      { stem: "Depositories (NSDL and CDSL) are described as:", options: ["Clearing Corporations","Secure digital vaults holding your electronic shares","Tax collection authorities","Broker subsidiaries"], correct: 1, explanation: "Depositories like NSDL and CDSL act as digital vaults, holding shares in dematerialised form." },
      { stem: "Clearing Corporations ensure trades settle with zero defaults. They are:", options: ["Regulated directly by the Government of India","Wholly owned subsidiaries of exchanges","Private equity firms","Part of SEBI"], correct: 1, explanation: "Clearing Corporations (e.g., NSCCL) are wholly owned subsidiaries of their respective exchanges." },
      { stem: "Brokers act as Depository Participants (DPs) to connect investors to:", options: ["SEBI","NSE and BSE","NSDL and CDSL","Clearing Corporations"], correct: 2, explanation: "As DPs, brokers like Zerodha connect investors to NSDL and CDSL for Demat services." },
      { stem: "Buying equity in a company means you own:", options: ["A loan given to the company","A micro-fraction of that business","The right to vote only","A fixed return bond"], correct: 1, explanation: "Buying equity (shares) means you own a proportional fraction of the company as a shareholder." },
      { stem: "Which correctly distinguishes Stocks from Shares?", options: ["They are exactly the same thing","Stock is general ownership; Shares are the specific units (e.g., 10 shares of Infosys)","Stocks are only for large companies; Shares for small","Stocks are traded on BSE; Shares on NSE"], correct: 1, explanation: "'Stock' refers to general ownership; 'shares' are the specific numbered units of that stock." },
      { stem: "Derivatives are financial contracts whose value is:", options: ["Fixed by SEBI","Equal to the face value of the underlying stock","Derived from an underlying asset rather than owning it directly","Based on inflation rates"], correct: 2, explanation: "Derivatives derive their value from an underlying asset without direct ownership." },
      { stem: "The Spot Market is where shares are bought and delivered:", options: ["After 30 days","Immediately or within the standard settlement cycle","Only during special sessions","Through futures contracts"], correct: 1, explanation: "The Spot (Cash) Market involves immediate buying/selling with settlement in the standard T+1 cycle." },
      { stem: "The Golden Rule for new investors as per the presentation is:", options: ["Always diversify across 10 asset classes","Never trade complex instruments you do not fully understand — master the Spot Market first","Buy on dips and sell on highs","Always use a stop loss"], correct: 1, explanation: "The golden rule: master the Spot Market first before venturing into complex derivatives or F&O." },
      { stem: "A Market Order executes at which price?", options: ["A price you specify in advance","The best available price at the moment of execution","The closing price of the previous day","The IPO price"], correct: 1, explanation: "A Market Order executes immediately at the best available market price — execution is guaranteed, price is not." },
      { stem: "Which order type guarantees price but not execution?", options: ["Market Order","Stop Loss Market Order","Limit Order","Bracket Order"], correct: 2, explanation: "A Limit Order sets a specific price — it executes only if the market reaches that price." },
      { stem: "A Stop Loss order is primarily used to:", options: ["Guarantee profit booking","Limit potential losses by triggering a sell at a defined price","Buy more shares when the price drops","Execute trades at opening bell only"], correct: 1, explanation: "A Stop Loss order automatically exits a position at a defined price to cap downside risk." },
      { stem: "The first step in the Zerodha account opening process is:", options: ["Physical visit to a Zerodha branch","Submission of paper KYC forms","Digital Onboarding (E-KYC) using Aadhaar-linked mobile number","Calling the Zerodha helpline"], correct: 2, explanation: "Zerodha's process starts with E-KYC using your Aadhaar-linked mobile for OTP verification." },
      { stem: "In-Person Verification (IPV) during Zerodha account opening is completed via:", options: ["A Zerodha executive visiting your home","A quick webcam video to confirm your presence — no physical visit required","Submission of a notarised document","Aadhaar OTP only"], correct: 1, explanation: "IPV at Zerodha is done digitally via a webcam video — no physical branch visit is required." },
      { stem: "E-Sign with Aadhaar during account opening involves:", options: ["Wet signature on printed forms","Physical stamp paper","Digitally signing forms using an OTP sent to your Aadhaar-linked mobile","Biometric fingerprint scan at a CDSL branch"], correct: 2, explanation: "E-Sign uses an OTP sent to your Aadhaar-linked mobile to digitally authenticate and sign documents." },
      { stem: "DDPI stands for:", options: ["Demat Debit and Pledge Instruction","Digital Delivery and Purchase Instruction","Demat Deposit and Proxy Instrument","Direct Debit and Pledge Index"], correct: 0, explanation: "DDPI stands for Demat Debit and Pledge Instruction — it replaces the older Power of Attorney (POA)." },
      { stem: "DDPI allows the broker to access shares:", options: ["For any transaction the broker deems necessary","Only for specific, investor-initiated trades","For pledging shares without investor knowledge","Across all linked family accounts"], correct: 1, explanation: "DDPI is investor-initiated — it only allows the broker to debit shares for trades specifically placed by the investor." },
      { stem: "If DDPI is not active, how must an investor authorize every sell transaction?", options: ["By calling the broker","Through the old Power of Attorney (POA)","Via eDIS — using a CDSL TPIN and OTP","By visiting the CDSL office"], correct: 2, explanation: "Without DDPI, investors must use eDIS with CDSL TPIN and OTP for each sell." },
      { stem: "Under T+1 settlement, when do shares reach your Demat vault after a buy trade?", options: ["Same day (T)","One trading day after the trade (T+1)","Two trading days after the trade (T+2)","Three trading days after the trade (T+3)"], correct: 1, explanation: "India moved to T+1 settlement — shares are credited to your Demat account one trading day after the buy trade." },
      { stem: "CMR (Client Master Report) is best described as:", options: ["A monthly brokerage statement","A tax filing document","The identity card for your Demat account detailing all core verified information","A report issued by SEBI"], correct: 2, explanation: "The CMR is the official identity document for your Demat account, containing all KYC-verified details." },
      { stem: "Adding a nominee to your Demat account is:", options: ["Optional but recommended","An absolute regulatory requirement to ensure wealth transfers to heirs","Only required for accounts with more than Rs. 10 lakh","Applicable only for joint accounts"], correct: 1, explanation: "SEBI mandates nomination for all Demat accounts — it ensures shares pass to heirs without legal complications." },
      { stem: "Short delivery occurs when a seller:", options: ["Sells at a price below the market","Sells shares but fails to deliver them to the exchange by the T+1 settlement deadline","Places a sell order after market hours","Sells more than 5% of their holding"], correct: 1, explanation: "Short delivery happens when a seller cannot deliver shares by the T+1 deadline." },
      { stem: "When short delivery happens, what action does the Clearing Corporation take?", options: ["The trade is cancelled and reversed","The buyer automatically gets cash","A live auction is conducted to buy the missing shares on behalf of the defaulting seller","The exchange suspends the stock"], correct: 2, explanation: "The Clearing Corporation conducts an auction to procure the missing shares, charging the defaulting seller." },
      { stem: "The penalty charged to the defaulting seller in a short delivery case can be up to:", options: ["5% of share value","10% of share value","20% of share value","50% of share value"], correct: 2, explanation: "The penalty for short delivery can be up to 20% of the share value." },
      { stem: "If the auction for short-delivered shares is successful, when are the shares credited to the buyer?", options: ["T+1","T+2 (visible in Kite from T+3)","T+3","T+5"], correct: 1, explanation: "After a successful auction, shares reach the buyer at T+2 (reflected in Kite from T+3)." },
      { stem: "If the auction completely fails, what happens to the buyer?", options: ["The buyer gets shares from the exchange inventory","The trade is reversed with no compensation","Cash is credited to the buyer trading account at the exchange close-out price","The buyer must wait for the next auction"], correct: 2, explanation: "If the auction fails, the Clearing Corporation credits cash to the buyer at the exchange close-out price." },
      { stem: "How much short delivery margin does Zerodha block on T day?", options: ["50%","80%","100%","120% of the security value"], correct: 3, explanation: "Zerodha blocks 120% of the security value as short delivery margin on T day." },
      { stem: "In Zerodha, the Gift Transfer feature is accessible via:", options: ["Kite mobile app only","Console > Portfolio > Holdings","The Zerodha branch office","CDSL directly"], correct: 1, explanation: "Gift Transfers are done through Console (console.zerodha.com) under Portfolio > Holdings." },
      { stem: "What is the charge for gifting shares in Zerodha?", options: ["Free of charge","Rs. 10 per security + GST","Rs. 25 per security per transaction + 18% GST","0.1% of transaction value"], correct: 2, explanation: "Zerodha charges Rs. 25 per security per gift transaction plus 18% GST." },
      { stem: "For the sender, what is the tax implication of gifting shares?", options: ["10% long-term capital gains tax applies","No tax implication for the sender","Short-term capital gains tax applies","Gift tax of 5% is levied"], correct: 1, explanation: "Gifting shares has no tax implication for the sender — the tax obligation falls on the recipient." }
    ];

    const set2Questions = [
      { stem: "An investor bought 50 shares at Rs. 100 and another 50 shares at Rs. 150. They sell 50 shares. Under FIFO, the cost basis of the sold shares is:", options: ["Rs. 150 each — the higher-priced lot","Rs. 100 each — the first lot purchased","Rs. 125 each — average of both lots","Determined randomly by the broker"], correct: 1, explanation: "FIFO (First In First Out): the earliest-purchased lot (Rs. 100) is treated as sold first." },
      { stem: "A company has 5 crore shares outstanding with a current market price of Rs. 400 per share. Its market capitalisation is:", options: ["Rs. 2,000 crore","Rs. 400 crore","Rs. 20,000 crore","Rs. 800 crore"], correct: 0, explanation: "Market cap = Shares outstanding × Market price = 5 crore × Rs. 400 = Rs. 2,000 crore." },
      { stem: "A company announces a 1:1 bonus issue. An investor currently holding 300 shares will hold after the bonus:", options: ["300 shares","450 shares","600 shares","900 shares"], correct: 2, explanation: "1:1 bonus means 1 additional share for every 1 held. 300 + 300 = 600 shares total." },
      { stem: "A stock with a face value of Rs. 10 declares a 50% dividend. An investor holding 200 shares receives:", options: ["Rs. 100","Rs. 1,000","Rs. 5,000","Rs. 10,000"], correct: 1, explanation: "Dividend = 50% of Rs. 10 face value = Rs. 5 per share. 200 × Rs. 5 = Rs. 1,000." },
      { stem: "Under India's current tax law, Long-Term Capital Gains (LTCG) on listed equity exceeding Rs. 1.25 lakh per year are taxed at:", options: ["0% — fully exempt","10% without indexation","12.5% without indexation","20% with indexation"], correct: 2, explanation: "Post July 2024 Budget: LTCG on equity is taxed at 12.5% (without indexation) above Rs. 1.25 lakh exemption." },
      { stem: "Short-Term Capital Gains (STCG) on equity shares held for less than 12 months are taxed at:", options: ["10%","15%","20%","As per the investor's income tax slab"], correct: 2, explanation: "Post July 2024 Budget: STCG on equity is 20% (increased from the earlier 15%)." },
      { stem: "If Nifty 50 falls 20% from the previous day's closing level during trading, the exchange:", options: ["Halts trading for 45 minutes only","Continues trading with enhanced margin requirements","Suspends trading for the remainder of the day","Alerts SEBI to intervene manually"], correct: 2, explanation: "A 20% index-level circuit breaker triggers a market-wide halt for the rest of the trading day." },
      { stem: "An intraday trader at Zerodha does not close their open position before the market closes. Zerodha will:", options: ["Roll the position over to the next trading day","Auto square-off the position near market close","Keep it open indefinitely at no extra charge","Charge a SEBI-mandated overnight penalty"], correct: 1, explanation: "Zerodha auto squares off un-closed intraday positions to prevent unintended overnight delivery obligations." },
      { stem: "Securities Transaction Tax (STT) on delivery-based equity purchases is charged at:", options: ["0.025% of turnover","0.1% of turnover","0.5% of turnover","1% of turnover"], correct: 1, explanation: "STT on delivery-based equity buy transactions is 0.1% of the total transaction value." },
      { stem: "Normal equity trading hours on BSE and NSE are:", options: ["9:00 AM to 3:30 PM","9:15 AM to 3:30 PM","9:30 AM to 4:00 PM","10:00 AM to 4:30 PM"], correct: 1, explanation: "Continuous trading on BSE and NSE runs from 9:15 AM to 3:30 PM IST on all working days." },
      { stem: "The Pre-Open session on NSE/BSE, used to discover the opening price, runs from:", options: ["9:00 AM to 9:08 AM for order entry","9:00 AM to 9:15 AM (order entry 9:00–9:08, matching 9:08–9:12)","8:30 AM to 9:00 AM","9:15 AM to 9:30 AM"], correct: 1, explanation: "The Pre-Open session runs 9:00–9:15 AM: order collection 9:00–9:08, price matching 9:08–9:12, buffer 9:12–9:15." },
      { stem: "A stock's Earnings Per Share (EPS) is Rs. 20 and it trades at Rs. 400. Its Price-to-Earnings (P/E) ratio is:", options: ["10","20","40","8,000"], correct: 1, explanation: "P/E ratio = Market Price ÷ EPS = Rs. 400 ÷ Rs. 20 = 20." },
      { stem: "A company's stock has a face value of Rs. 1 but trades at Rs. 3,500. The face value is most relevant for:", options: ["Setting intraday margin requirements","Calculating dividends and bonus issues","Determining exchange circuit limits","Daily mark-to-market settlement"], correct: 1, explanation: "Dividends are declared as a percentage of face value (e.g., '500% dividend' means Rs. 5 per share at Rs. 1 face value)." },
      { stem: "A company does a 5:1 stock split. An investor holds 100 shares at Rs. 500 each. After the split, the investor has:", options: ["100 shares at Rs. 2,500 each","500 shares at Rs. 100 each","20 shares at Rs. 2,500 each","500 shares at Rs. 500 each"], correct: 1, explanation: "In a 5:1 split, shares multiply by 5 and price divides by 5. Total value (Rs. 50,000) stays unchanged." },
      { stem: "In a rights issue, who is given the first right to subscribe for the newly issued shares?", options: ["Retail public through a fresh IPO process","Qualified Institutional Buyers (QIBs) only","Existing shareholders, in proportion to their current holding","Foreign Institutional Investors (FIIs)"], correct: 2, explanation: "A rights issue offers new shares exclusively to existing shareholders in proportion to their current holding." },
      { stem: "A Nifty 50 ETF (Exchange Traded Fund) replicates the index by:", options: ["Outperforming Nifty 50 by picking the best stocks","Holding the same 50 stocks in the same proportion as the Nifty 50 index","Investing only in the top 5 Nifty stocks by weight","Holding mostly cash and buying futures"], correct: 1, explanation: "An ETF passively mirrors the index composition and proportion, aiming to match (not beat) its returns." },
      { stem: "Zerodha Coin is used to invest in:", options: ["Gold and silver commodity ETFs","Direct mutual funds — eliminating distributor commission","US-listed stocks and ETFs","Corporate bonds and NCDs"], correct: 1, explanation: "Zerodha Coin is Zerodha's platform for investing in direct mutual fund plans, which carry lower expense ratios." },
      { stem: "A GTT (Good Till Triggered) order in Zerodha Kite remains active for up to:", options: ["1 trading day only","7 calendar days","1 year from placement","Indefinitely until manually cancelled"], correct: 2, explanation: "GTT orders stay active for up to 1 year, automatically triggering when the price condition is met." },
      { stem: "When you pledge shares in Zerodha to obtain trading margin, the pledged shares:", options: ["Are sold and cash is credited to your trading account","Remain in your Demat account but are marked as pledged collateral","Are transferred to Zerodha's own account","Must be physically lodged with the clearing corporation"], correct: 1, explanation: "Pledging creates a lien on shares — they stay in your Demat but are locked as collateral until unpledged." },
      { stem: "When a company announces a share buyback, it generally signals:", options: ["The company is in financial difficulty and needs liquidity","Management believes shares are undervalued and returns surplus cash to shareholders","SEBI has mandated the repurchase","The company intends to delist from the exchange"], correct: 1, explanation: "A buyback typically signals that management finds the stock undervalued, and it returns value to shareholders." },
      { stem: "The Nifty Bank index on NSE tracks:", options: ["All BSE and NSE-listed public sector banks","The 12 most liquid and largest banking stocks listed on NSE","Only private sector banks","The top 5 banks by market capitalisation"], correct: 1, explanation: "Nifty Bank comprises the 12 most liquid and capitalised banking stocks on the NSE." },
      { stem: "Zerodha Varsity is best described as:", options: ["Zerodha's equity trading platform","A free, comprehensive stock market and financial education platform by Zerodha","Zerodha's direct mutual fund investment portal","An AI-based options analytics tool"], correct: 1, explanation: "Zerodha Varsity (varsity.zerodha.com) provides free courses on equity, derivatives, and personal finance." },
      { stem: "SEBI defines a 'Large Cap' company as one ranked within the top ___ Indian listed companies by full market capitalisation:", options: ["50","100","250","500"], correct: 1, explanation: "As per SEBI's circular, large cap companies are the top 100 firms by full market capitalisation on Indian exchanges." },
      { stem: "In futures and options, 'Open Interest' refers to:", options: ["The total number of trades executed in that session","The total number of outstanding derivative contracts that have not yet been settled or closed","The interest payable on margin borrowed from the broker","The daily trading volume in the contract"], correct: 1, explanation: "Open Interest counts all active (open) contracts in the market — rising OI signals new money entering the market." },
      { stem: "India VIX (Volatility Index) measures:", options: ["The daily percentage change in the Nifty 50","The market's expectation of Nifty 50 volatility over the next 30 calendar days","The total market capitalisation of all NSE-listed companies","The number of FII net buy/sell transactions in a session"], correct: 1, explanation: "India VIX is computed from Nifty option prices and reflects market participants' expectation of near-term volatility." },
      { stem: "An NRI (Non-Resident Indian) who wants to invest in Indian equities must open:", options: ["A regular resident savings and Demat account","An NRE or NRO-linked Demat and trading account under FEMA guidelines","A US brokerage account with India access","A standard Zerodha account with no special designation"], correct: 1, explanation: "NRIs must route Indian equity investments through NRE or NRO accounts linked to a PIS (Portfolio Investment Scheme) account." },
      { stem: "TDS (Tax Deducted at Source) on dividends paid by Indian companies is deducted when the dividend from a single company exceeds ___ per financial year:", options: ["Rs. 1,000","Rs. 5,000","Rs. 10,000","Rs. 50,000"], correct: 1, explanation: "TDS at 10% is applicable on dividends exceeding Rs. 5,000 per financial year from a single company." },
      { stem: "A 'Bear Market' is typically defined as a market decline of:", options: ["5% or more from recent highs","10% or more over at least 2 months","20% or more from recent highs, sustained over time","Any week with more losing days than gaining days"], correct: 2, explanation: "A bear market is commonly defined as a 20% or greater decline from recent highs, sustained over months." },
      { stem: "An investor holds only IT-sector stocks in their portfolio. The main risk of this approach is:", options: ["Systematic risk that affects the entire market equally","Concentration risk — all stocks may decline together on the same sector news","Currency risk from rupee depreciation","Settlement risk from T+1 failures"], correct: 1, explanation: "Holding a single sector creates concentration risk — a negative sector event affects the entire portfolio simultaneously." },
      { stem: "Zerodha Sensibull is primarily a platform for:", options: ["Investing in direct mutual funds","Options trading — strategy builder, payoff graphs, and market analysis","Fundamental equity research and reports","Fixed income and bond investment"], correct: 1, explanation: "Sensibull (integrated with Zerodha) helps traders build options strategies, visualise payoffs, and find suitable option trades." },
      { stem: "The key difference between a Rights Issue and an FPO (Follow-on Public Offer) is:", options: ["Rights Issues are for newly incorporated companies; FPOs are for existing listed ones","A Rights Issue offers shares to existing shareholders first; an FPO offers shares to the general public","Rights Issue shares are free; FPO shares are always at a premium","An FPO is regulated by RBI; a Rights Issue is regulated by SEBI"], correct: 1, explanation: "Rights Issues give existing shareholders the exclusive right to buy new shares first; FPOs are open to the general public." },
      { stem: "A Futures contract obligates the buyer to:", options: ["Buy the underlying asset at the current spot price on the trade date","Buy the underlying asset at a pre-agreed price on a specified future date","Acquire the right (not obligation) to buy the underlying asset","Receive any dividends during the contract period"], correct: 1, explanation: "A futures contract is a binding obligation — both buyer and seller must complete the transaction at the agreed price and date." },
      { stem: "Buying a Put option gives the holder the:", options: ["Right to buy the underlying asset at the strike price","Obligation to sell the underlying asset on expiry","Right to sell the underlying asset at the strike price","Right to receive dividends during the option's life"], correct: 2, explanation: "A Put option gives the buyer the right (not obligation) to SELL the underlying at the strike price before expiry." },
      { stem: "In short selling, a trader:", options: ["Buys shares and holds them for a very short duration","Borrows and sells shares expecting the price to fall, then buys them back at a lower price to profit","Sells shares at a price lower than the prevailing market price","Sells only intraday positions without holding overnight"], correct: 1, explanation: "Short sellers borrow shares, sell them, hope the price falls, buy them back cheaper, and return them — pocketing the difference." },
      { stem: "A 'liquid' stock is best described as one that:", options: ["Has a very high P/E ratio","Can be bought or sold quickly in large quantities without significantly moving the price","Consistently pays large dividends","Has a face value of Rs. 1"], correct: 1, explanation: "Liquidity means a stock has sufficient buyers and sellers that large trades don't materially impact its price." },
      { stem: "Zerodha Streak allows traders to:", options: ["Invest directly in mutual funds without a distributor","Create, backtest, and deploy algorithmic trading strategies without coding","Access institutional equity research reports","Apply for IPOs and rights issues digitally"], correct: 1, explanation: "Zerodha Streak is a no-code algo trading platform for building, backtesting, and live-deploying rule-based strategies." },
      { stem: "Preference shareholders receive dividends:", options: ["After equity shareholders and at a variable rate","Only if the company earns profits above a prescribed threshold","Before equity shareholders, at a fixed rate, regardless of profit levels","Only on the maturity/redemption of preference shares"], correct: 2, explanation: "Preference shares carry a fixed dividend that is paid before any dividend is declared for equity shareholders." },
      { stem: "A REIT (Real Estate Investment Trust) allows retail investors to:", options: ["Directly own commercial office buildings","Invest in a pool of income-generating real estate through a SEBI-regulated security listed on the stock exchange","Earn tax-free rental income without any property ownership","Avail home loans at preferential interest rates"], correct: 1, explanation: "REITs pool investor money to own and operate real estate, and are listed on exchanges — giving small investors access to commercial property income." },
      { stem: "A Systematic Investment Plan (SIP) in a mutual fund involves:", options: ["A one-time lump sum investment made once a year","Investing a fixed amount at regular intervals (weekly/monthly) regardless of current market levels","Investing only when markets fall below a threshold price","Locking funds in a fixed deposit managed by a mutual fund house"], correct: 1, explanation: "SIP invests a fixed sum periodically — this rupee-cost averaging approach reduces the impact of market timing." },
      { stem: "A mutual fund's expense ratio of 1.2% is deducted:", options: ["As a one-time flat fee at the time of purchase","As a percentage of the fund's daily NAV, reducing the fund's NAV slightly each day","Only when units are redeemed by the investor","As an annual lump sum charged directly to the investor's bank account"], correct: 1, explanation: "The expense ratio is an annual fee expressed as a % of AUM, charged proportionally each day against the fund's NAV." },
      { stem: "Rolling over a futures position means:", options: ["Converting an open futures position into an equivalent options position","Closing the current expiry month's contract and simultaneously opening the same position in the next expiry month","Automatically extending the same contract by one more month without closing it","Pledging the open futures position as collateral for additional margin"], correct: 1, explanation: "Rollover = squaring off the near-month contract and re-entering in the next month, to maintain the same market view." },
      { stem: "The Securities Lending and Borrowing (SLB) mechanism allows:", options: ["Only share borrowing for short selling — lending is restricted","Only share lending by long-term holders — borrowing is restricted","Both lending (to earn a fee) and borrowing (for short selling) of securities","Only institutional investors to lend or borrow shares"], correct: 2, explanation: "SLB lets long-term holders lend idle shares for a fee, while short sellers borrow those shares to execute short positions." },
      { stem: "If the Nifty 50 index falls 20% from the previous day's close during a trading session, exchange regulations require:", options: ["A temporary 45-minute trading halt only","Trading to continue with enhanced circuit limits applied to individual stocks","Market-wide trading to be suspended for the remainder of that trading day","SEBI to intervene and manually set circuit limits for all stocks"], correct: 2, explanation: "A 20% market-wide circuit breaker halts all trading for the rest of the trading day, with no resumption till next morning." },
      { stem: "A mutual fund's NAV (Net Asset Value) is calculated:", options: ["Once a month based on the fund manager's portfolio assessment","At the end of every trading day, based on the current market value of all holdings divided by outstanding units","At the time of each individual buy or redeem transaction","Once a quarter after financial results are published"], correct: 1, explanation: "NAV = (Total assets – Liabilities) ÷ Outstanding units, calculated daily after market close for all open-ended funds." },
      { stem: "Investing in a 'Direct' mutual fund plan (vs. a 'Regular' plan) gives you a higher return because:", options: ["The fund manager takes more risk on your behalf","The expense ratio is lower — no distributor commission is embedded in the NAV","The Direct plan is managed directly by the AMC, giving priority in execution","The lock-in period is shorter, providing more flexibility"], correct: 1, explanation: "Direct plans exclude distributor commissions from the expense ratio, resulting in a higher NAV growth over time." },
      { stem: "A company earns a net profit of Rs. 100 crore and has 10 crore shares outstanding. Its Earnings Per Share (EPS) is:", options: ["Rs. 10","Rs. 100","Rs. 1,000","Rs. 10,000"], correct: 0, explanation: "EPS = Net Profit ÷ Shares Outstanding = Rs. 100 crore ÷ 10 crore = Rs. 10 per share." },
      { stem: "A stock has a Beta of 1.5. If Nifty 50 rises 10%, this stock is expected to rise approximately:", options: ["7% (it moves less than the market)","15% (it moves 1.5× the market in the same direction)","10% (it tracks the market exactly)","5% (it moves one-third as much as the market)"], correct: 1, explanation: "Beta measures a stock's sensitivity to market moves. Beta 1.5 means the stock moves 1.5× the market's movement." },
      { stem: "A Nifty 50 index fund has an expense ratio of 0.1% per year. If Nifty 50 returns 15% in a year, the investor earns approximately:", options: ["15.1%","15.0%","14.9%","10.0%"], correct: 2, explanation: "Net return ≈ index return − expense ratio = 15% − 0.1% = 14.9% (before taxes)." },
      { stem: "A rights issue is announced in a 1:4 ratio. An investor currently holding 800 shares can subscribe to a maximum of:", options: ["200 new shares","400 new shares","800 new shares","3,200 new shares"], correct: 0, explanation: "1:4 ratio = 1 new share for every 4 held. 800 ÷ 4 = 200 new shares entitlement." },
      { stem: "When pledged shares fall below the broker's required margin threshold, the investor typically receives:", options: ["An automatic closing of all open positions without any notice","A margin call — a notification to deposit additional funds or reduce open positions","A SEBI notice requiring closure of the trading account","A 30-day grace period with no penalty"], correct: 1, explanation: "A margin call is a broker's demand for more collateral. Failure to respond leads to the broker liquidating positions to recover margin." }
    ];

    try {

      if (!hasSet1) {
        await DB.put('topics', {
          module: 'stock-market-mcq',
          title: 'NRI Basics of Stock Market — Set 1',
          description: 'MCQ assessment (Set 1) covering Zerodha, stock exchanges, SEBI, IPO, order types, account opening, settlement, short delivery, gift transfers, and FIFO. 50 questions, 1 mark each.',
          scenario: '',
          checklist: set1Questions,
          bot_script: [],
          enabled: true,
          created_at: new Date().toISOString()
        });
      }
      if (!hasSet2) {
        await DB.put('topics', {
          module: 'stock-market-mcq',
          title: 'NRI Basics of Stock Market — Set 2',
          description: 'MCQ assessment (Set 2) with simpler questions on Zerodha, BSE/NSE, SEBI, IPO, Demat accounts, order types, settlement, and compliance. 50 questions, 1 mark each.',
          scenario: '',
          checklist: set2Questions,
          bot_script: [],
          enabled: true,
          created_at: new Date().toISOString()
        });
      }
      if (!hasSet3) {
        const set3Questions = [
          { stem: "Which scenario correctly identifies when DP charges are NOT applicable at Zerodha?", options: ["When selling delivery shares held in demat","When buying delivery shares","When selling F&O contracts","Both B and C — DP charges only apply when DEMAT debit happens on share sell"], correct: 3, explanation: "DP charges are levied only when shares are debited from your demat account. Buying shares or selling F&O positions (no demat debit involved) do not attract DP charges." },
          { stem: "An NRI trading under Non-PIS places a buy order for shares worth ₹30,000. What is the exact brokerage charged?", options: ["₹150","₹50","₹200","₹30"], correct: 0, explanation: "For NRI Non-PIS accounts at Zerodha, brokerage is 0.5% of the transaction value. 0.5% × ₹30,000 = ₹150." },
          { stem: "A Kite client currently has 245 instruments in their watchlists and 24 watchlists. They try to create one more watchlist. What happens?", options: ["The system allows it since the 250-instrument limit isn't breached","The new watchlist is created successfully — 25 is the limit","The new watchlist fails — 25 is the maximum number of watchlists","Both limits are breached simultaneously"], correct: 2, explanation: "Kite allows a maximum of 25 watchlists per account. Once 25 watchlists exist, no further watchlists can be created regardless of instrument count." },
          { stem: "What is the total AMC per year (including GST) for an NRI demat account at Zerodha?", options: ["₹500","₹540","₹590","₹600"], correct: 2, explanation: "Zerodha charges ₹500 per year as AMC for NRI demat accounts. With 18% GST, the total is ₹500 + ₹90 = ₹590 per year." },
          { stem: "A client has holdings worth ₹9.5 lakh in a single Zerodha BSDA account. The next quarter their portfolio grows to ₹10.5 lakh. What happens to their AMC?", options: ["They continue paying ₹100 + GST","They still pay ₹0 as BSDA cap hasn't been formally revised","Their account is converted to non-BSDA and they pay ₹300 + GST per year","They must close the account immediately"], correct: 2, explanation: "BSDA (Basic Services Demat Account) requires the holder to have securities in only one DP and the value must stay within limits. Exceeding the ₹10 lakh cap triggers conversion to a regular (non-BSDA) account with standard AMC charges." },
          { stem: "A company has 10 crore total shares. Promoters hold 72%, FIIs hold 18%, and the public holds 10%. What regulatory issue does this present?", options: ["FII holding is too high","Promoter holding exceeds SEBI threshold","Public shareholding is below the SEBI-mandated 25% minimum","No issue; SEBI has no minimum shareholding mandate"], correct: 2, explanation: "SEBI mandates a minimum public shareholding (MPS) of 25% for all listed companies. With only 10% public holding, this company is in violation and must reduce promoter holding to comply." },
          { stem: "A client has 3 different brokers and holds securities worth ₹3.5 lakh. Does their Zerodha account qualify as BSDA?", options: ["Yes, holdings are below ₹4 lakh","No, they hold accounts at multiple brokers","Yes, BSDA qualification only checks holdings at Zerodha","No, minimum holding to qualify is ₹1 lakh"], correct: 1, explanation: "BSDA eligibility requires the investor to hold a demat account with only ONE depository participant. Having accounts at multiple brokers disqualifies them from BSDA, regardless of holding value." },
          { stem: "An NRI client at Zerodha buys ₹5,00,000 worth of shares via PIS. What is the maximum brokerage they will be charged?", options: ["₹50","₹100","₹200","₹2,500"], correct: 2, explanation: "For NRI PIS accounts at Zerodha, brokerage is 0.5% of the transaction value, subject to a maximum of ₹200 per order. 0.5% of ₹5,00,000 = ₹2,500, but the cap of ₹200 applies." },
          { stem: "Which Zerodha product serves as the back-office platform for P&L, holdings, and tax reports?", options: ["Kite","Console","Coin","Varsity"], correct: 1, explanation: "Console (console.zerodha.com) is Zerodha's back-office platform providing P&L statements, holdings overview, tax reports (including capital gains), and account details." },
          { stem: "You short a stock at Rs. 75. For you to make a profit, the stock should:", options: ["Move higher than Rs. 75","Stay exactly at Rs. 75","Move higher than Rs. 75 but lower than Rs. 80","Go to any price lower than Rs. 75"], correct: 3, explanation: "In a short position, you sell first and buy back later. Profit = selling price − buy-back price. For profit, the stock must fall below your shorting price of Rs. 75." },
          { stem: "The Repo Rate is best described as:", options: ["The rate at which commercial banks lend money to retail customers","The rate at which commercial banks lend and borrow between each other","The rate at which commercial banks borrow money from the RBI","The rate at which the RBI borrows money from retail customers"], correct: 2, explanation: "The Repo Rate is the rate at which the RBI lends money to commercial banks (banks borrow from RBI by pledging government securities). It is the primary tool the RBI uses to control liquidity and inflation." },
          { stem: "The Reverse Repo Rate is best described as:", options: ["The rate at which banks lend to retail customers","The rate at which banks borrow from each other","The deposit rate the RBI offers to banks when they park surplus funds with the RBI","The transaction fee applied by stock exchanges"], correct: 2, explanation: "The Reverse Repo Rate is the rate at which the RBI accepts deposits from commercial banks. When banks park surplus funds with the RBI overnight, they earn this rate." },
          { stem: "A company offers a buyback of shares at a 20% premium to the market price. What should an investor ideally do?", options: ["Tender shares blindly and pocket the premium immediately","Blindly ignore the offer without reviewing corporate details","Evaluate the company's future prospects and then decide whether to tender or retain","Negotiate with the broker for a better premium rate"], correct: 2, explanation: "A buyback premium is attractive but should not be accepted blindly. If the company's future growth potential exceeds the 20% premium, retaining the shares may be more valuable long-term." },
          { stem: "A trader selects CNC (Cash n Carry) and sells shares from their DEMAT account. When will they receive the full funds?", options: ["Shares are debited on T day; 100% funds are credited on the same day","80% of funds on the same day (T), remaining 20% on T+1 day","Shares are debited on T day; funds are completely received on T+2 day","100% of funds are received instantly on the same day"], correct: 1, explanation: "Under T+1 settlement: when you sell CNC shares, 80% of the sale proceeds are made available the same day (early pay-out), while the remaining 20% is credited on T+1 after settlement." },
          { stem: "Goods and Services Tax (GST) on stock market transactions is applicable on:", options: ["Only the brokerage charged by the stockbroker","Only the transaction charges applicable by the Stock Exchanges","Brokerage, transaction charges, and SEBI charges — all attract 18% GST","Only the stamp duty costs"], correct: 2, explanation: "GST at 18% is levied on brokerage, exchange transaction charges, SEBI turnover charges, and DP charges. Stamp duty and STT are exempt from GST." },
          { stem: "Once you place an order to buy a stock, how can you modify it and how many times?", options: ["25 times; you can modify only the price","250 times; you can modify only the quantity","20 times; you cannot modify the order details under any circumstances","25 times; you can modify both the price and quantity via the order book"], correct: 3, explanation: "Orders in Kite can be modified up to 25 times before execution. Both price and quantity can be changed via the Order Book as long as the order is still pending." },
          { stem: "A trader has shorted 560 shares of SBI. To square off this position, the trader must:", options: ["Short an additional 560 shares under an intraday product type","Instruct the broker to move the shares to another depository participant","BUY 560 shares of SBI to close the short position","Place a limit sell order at the upper circuit price"], correct: 2, explanation: "Short positions are squared off by buying back the same quantity of shares. Buying 560 SBI shares closes the 560-share short position." },
          { stem: "The last traded price of TCS is 1200. What happens when you place a market order to buy this stock?", options: ["The stock is bought at a guaranteed price below 1200","The stock will always be bought at a price higher than 1200","The stock is bought around the last traded price based on immediate market liquidity","Placing a market order is disabled due to volatility"], correct: 2, explanation: "A Market Order executes at the best available price at the moment of placement — typically close to the last traded price, but the exact price depends on current order book liquidity." },
          { stem: "The stock price of Yes Bank is trading at 373. You wish to initiate a BUY only if the stock moves UP to 385. Which order type should you use?", options: ["Place an immediate market order","Place a limit buy order at 385","Place a stop-loss buy trigger order at 385","Place an upper circuit bracket order"], correct: 2, explanation: "To buy a stock only when it rises above the current price, use a Stop-Loss buy order with a trigger at 385. A regular limit buy at 385 would execute immediately at the lower current price, not at 385." },
          { stem: "To be eligible to receive a corporate dividend, you need to be a shareholder on:", options: ["The dividend announcement date","The dividend declaration date","The record date","5 days prior to the record date"], correct: 2, explanation: "To receive a dividend, you must hold the shares on the Record Date. If you buy shares before the ex-dividend date, you'll be registered as a shareholder on the record date and receive the dividend." },
          { stem: "When you want to accurately measure and evaluate investment returns over a multi-year period, you opt for:", options: ["Absolute Return","CAGR (Compounded Annual Growth Rate)","Either Absolute Return or CAGR seamlessly","Intraday Scalping Percentage"], correct: 1, explanation: "CAGR (Compounded Annual Growth Rate) normalizes returns across different time periods, making it the standard metric for comparing multi-year investment performance." },
          { stem: "Which statement best describes the role of a Clearing Corporation?", options: ["Guarantee the structural settlement of funds and securities between counterparties","Help retail clients directly buy and execute transactions in the market","Store corporate securities in electronic DEMAT format vaults","Manage front-end trading terminal watchlists for retail participants"], correct: 0, explanation: "Clearing Corporations (e.g., NSCCL for NSE) act as the central counterparty to all trades, guaranteeing settlement of both funds and securities, and eliminating counterparty default risk." },
          { stem: "Which best describes the 'greenshoe option' in the context of an IPO?", options: ["To completely withdraw the IPO filing at any point if demand is poor","An option to stabilize the market price by buying up to 15% of the shares from the market post-listing","To dynamically change the volume count of shares on offer day-to-day","To vary the price band boundaries based on initial retail bidder responses"], correct: 1, explanation: "The greenshoe option (over-allotment option) allows underwriters to buy up to 15% of the originally offered shares from the open market post-listing to stabilize the stock price during the initial trading period." },
          { stem: "In corporate finance and reporting, CAPEX is best described as:", options: ["Funds required for marketing and consumer advertising campaigns","Funds required exclusively to repay long-standing institutional debt obligations","Funds deployed for capital expenditure towards long-term operational expansion and asset creation","Funds required to cover immediate day-to-day business operations"], correct: 2, explanation: "CAPEX (Capital Expenditure) refers to funds invested by a company in acquiring, upgrading, or maintaining physical or intangible long-term assets like machinery, buildings, or technology." },
          { stem: "All else being equal, if the price of a certain product increases systematically over time, it can be attributed to:", options: ["The subjective greed level of the merchant or seller","A broad, unbacked increase in local consumer purchasing power","Inflation","Bearish market sentiment cycles"], correct: 2, explanation: "Sustained, systematic price increases across an economy are the definition of inflation — a rise in the general price level of goods and services over time." },
          { stem: "During its formal monetary review sessions, the RBI directly reviews and calibrates which of the following rates?", options: ["Repo Rate, Reverse Repo Rate, and Cash Reserve Ratio (CRR)","Wholesale Price Index (WPI) and Consumer Price Index (CPI)","Industrial production data output numbers","Statutory direct corporate tax rate percentages"], correct: 0, explanation: "The RBI Monetary Policy Committee (MPC) directly controls the Repo Rate, Reverse Repo Rate, and CRR. WPI, CPI, and industrial data are inputs it monitors — not rates it sets." },
          { stem: "Post a corporate stock split event, the formal nominal face value of the share changes.", options: ["True — the face value is divided proportionally by the split ratio","False — face value remains unchanged; only the number of shares changes"], correct: 0, explanation: "In a stock split, the face value is reduced in proportion to the split ratio. For example, in a 5:1 split, a share with face value Rs. 10 becomes Rs. 2, while the number of shares increases fivefold." },
          { stem: "A transaction contract note is legally issued and sent to an investor by which entity?", options: ["The commercial bank linked to the trading account","The stockbroker","The Securities and Exchange Board of India (SEBI)","The National Stock Exchange clearing desk"], correct: 1, explanation: "A contract note is a legally binding document issued by the stockbroker to the client for every executed trade, confirming transaction details, charges, and taxes." },
          { stem: "The 'Market Depth' feature inside an active trading terminal provides which real-time data?", options: ["Real-time buy bids and sell offer quotes at various price levels","Overall historic trading volume accumulated over the past calendar year","Absolute structural Open, High, Low, and Close price parameters of previous days","Current aggregate market capitalisation of the firm"], correct: 0, explanation: "Market Depth (Level 2 data) shows the live order book — the top 5 buy bids and top 5 sell offers at various price levels, giving traders a view of buying and selling pressure." },
          { stem: "What is the primary function of an order book with respect to a trading terminal?", options: ["A layout to track historical stock prices","A layout to track daily opening prices","A system interface to keep track of pending and active orders placed by the client","An unchangeable book used to log only finalized, executed trades"], correct: 2, explanation: "The Order Book in a trading terminal displays all pending (open) orders placed by the client, allowing them to track, modify, or cancel orders before execution." },
          { stem: "An Initial Public Offering (IPO) fundamentally helps uplift a company's public profile and aids in its operational growth.", options: ["True — it raises fresh capital, enhances visibility, and enables employee ESOPs","False — an IPO only dilutes promoter control with no operational benefit"], correct: 0, explanation: "An IPO raises fresh equity capital, improves the company's credibility and public profile, provides an exit for early investors, enables ESOP schemes for employees, and funds growth initiatives." },
          { stem: "After a company lists its shares, which of the following pathways are open to promoters to raise additional equity capital?", options: ["Commercial bank fixed deposits and savings accounts","Intraday short selling via CNC product lines","Rights Issues, Offers for Sale (OFS), and Follow-on Public Offers (FPO)","Wholesale debt market bullion conversions"], correct: 2, explanation: "Once listed, a company can raise additional equity capital through Rights Issues (to existing shareholders), FPOs (to the public), or allow promoters to divest through OFS." },
          { stem: "A corporate Rights Issue creates new shares offered to existing shareholders. What structural impact does this have on existing stock value?", options: ["It permanently locks the share price from dropping below the entry cost","It dilutes the ownership value and percentage of previously held shares","It automatically doubles the nominal face value of the stock","It triggers an immediate T+1 cash settlement into the client's bank account"], correct: 1, explanation: "A Rights Issue increases the total number of shares outstanding. Without a proportional increase in company value, each existing share represents a smaller ownership percentage — this is dilution." },
          { stem: "The stock exchange allows a company to route capital divestments through an Offer for Sale (OFS) window primarily when:", options: ["The company needs fresh cash to fund a factory expansion project","The corporate board intends to issue free bonus stock rewards to retail traders","Promoters want to sell down their holdings and/or maintain minimum public shareholding requirements","The clearing corporation demands an emergency margin cash replenishment"], correct: 2, explanation: "OFS is a stock exchange mechanism used by promoters (or existing shareholders) to sell their shares to the public without issuing new shares, helping meet SEBI's minimum public shareholding norms." },
          { stem: "Why do market participants follow technology sector blue-chip earnings guidance announcements so closely every quarter?", options: ["Guidance numbers contain audited historical profit and loss data points","Management forecasts are legally binding commitments that eliminate market risk","Guidance numbers reveal forward-looking management expectations that heavily influence broader market sentiment","Corporate guidance determines the exact GST rate applied to brokerage transactions"], correct: 2, explanation: "Earnings guidance represents management's forward-looking expectations for revenue and profit. Since major tech stocks have large index weights, their outlooks can swing entire market sentiment." },
          { stem: "During an annual Union Budget, an increase in excise duties on cigarettes can drag down broader market indexes because:", options: ["Higher product prices automatically trigger an immediate stock split","The affected firm is forced to switch to the Wholesale Debt Market","The affected companies are index heavyweights, and a drop in their profitability causes participants to sell","An excise duty hike automatically expands the Cash Reserve Ratio (CRR)"], correct: 2, explanation: "Index-heavy companies like ITC are significantly impacted by excise duty hikes on cigarettes. When their earnings are expected to drop, institutions sell, dragging down indices where they have large weightages." },
          { stem: "When commercial banks park surplus cash reserves with the Reserve Bank of India, what is their primary objective?", options: ["To maximize speculative returns through leveraged equity derivatives","Capital safety, because the central bank carries zero default risk","To bypass standard clearing corporation transaction fees","To trigger an automated stock split across public PSU bank shares"], correct: 1, explanation: "Banks park funds with the RBI primarily for safety — the RBI carries sovereign-level, zero-default risk. The Reverse Repo facility provides a risk-free parking option for surplus funds." },
          { stem: "In both a corporate bonus issue and a corporate stock split, what happens to the investor's overall investment value?", options: ["It grows exponentially based on the split or bonus ratio","It is cut in half due to sudden market correction dynamics","It remains exactly the same before and after the corporate action takes effect","It is locked inside a broker pool account for a mandatory multi-year holding period"], correct: 2, explanation: "Both bonus issues and stock splits are accounting events. The number of shares increases but the price adjusts proportionally, keeping the total market value of the investor's holding unchanged." },
          { stem: "A company is profitable and holds excess cash but decides not to declare an annual dividend. What is the most likely strategic reason?", options: ["The company is legally prohibited from distributing dividends during high-inflation cycles","Management intends to reduce the total number of outstanding public market shares","Management believes they can generate better long-term value by reinvesting that cash into new growth projects","The company needs to deposit those funds with the RBI to satisfy CRR rules"], correct: 2, explanation: "Companies often retain earnings (instead of paying dividends) when they believe the reinvestment returns — in new products, acquisitions, or R&D — exceed what shareholders could earn elsewhere." },
          { stem: "Under the modern accelerated equity settlement cycle, what happens on settlement day when a client sells a stock?", options: ["Shares are transferred to a broker's pool account where they can be held for several weeks","Funds are entirely withheld by SEBI until an annual tax audit is completed","Earmarked shares are debited from the demat account and transferred to the clearing corporation for delivery","The stock is automatically converted into a leveraged futures contract position"], correct: 2, explanation: "Under T+1 settlement, earmarked shares are debited from the seller's demat account and transferred to the Clearing Corporation, which then credits them to the buyer's demat account on T+1." },
          { stem: "A Depository Participant (DP) serves as an intermediary between an investor and the main depository. A DP is legally defined as a member of:", options: ["The front-end algorithmic trading desk network","The commercial banking clearing house syndicate","National Securities Depository Limited (NSDL) and/or Central Depository Services Limited (CDSL)","The S&P BSE Sensex index construction committee"], correct: 2, explanation: "A DP (e.g., Zerodha) is a SEBI-registered entity that has been admitted as a member of NSDL and/or CDSL, acting as the link between individual investors and the central depository." },
          { stem: "The historical transition from physical paper share certificates to digital format stored inside a DEMAT account is known as:", options: ["Portfolio Hedging","Earmarking","Dematerialization","Book Building"], correct: 2, explanation: "Dematerialization is the process of converting physical paper share certificates into electronic form held in a Demat account with NSDL or CDSL." },
          { stem: "Which of the following criteria is a valid parameter to evaluate when choosing a stockbroker?", options: ["The broker's personal ability to guarantee risk-free returns on options trades","Whether the broker holds a physical seat on the central banking policy committee","The simplicity of the platform, quality of support, and transparency of the broker's own financial health","The broker's direct authority to modify executed trades inside the trade book"], correct: 2, explanation: "When choosing a broker, key evaluation factors include platform usability, customer service quality, fee transparency, regulatory compliance, and the broker's own financial stability." },
          { stem: "Which of the following points directly highlights a core objective of SEBI?", options: ["Setting weekly price targets for blue-chip technology stocks","Maximizing short-term speculative trading volumes for scalpers","Protecting retail investor interests and ensuring stock exchanges conduct business fairly","Managing the printing and distribution of paper currency notes"], correct: 2, explanation: "SEBI's core mandate includes protecting investor interests, promoting market development, and regulating the securities market to ensure fair, transparent, and efficient operations." },
          { stem: "An investor who actively identifies quality companies beaten down by short-term negative market sentiment is classified as a:", options: ["Growth Investor","Value Investor","Scalp Trader","Day Trader"], correct: 1, explanation: "A Value Investor seeks stocks trading below their intrinsic value, often caused by temporary negative sentiment. The strategy involves patience — waiting for the market to recognise the company's true worth." },
          { stem: "What is the standard term used to describe the very initial pool of capital raised by an entrepreneur from friends and family to jumpstart business operations?", options: ["Series A Venture Capital","Public Capitalization Float","The Seed Fund","Institutional Debt Debenture"], correct: 2, explanation: "Seed funding is the earliest stage of startup financing, typically from the founder, friends, and family. It funds initial product development and proof-of-concept before formal VC rounds." },
          { stem: "How does a Private Equity (PE) investor fundamentally differ from an early-stage Venture Capitalist (VC)?", options: ["PE investors focus exclusively on day-trading near-expiry options contracts","PE investors only deploy small capital sums into unproven conceptual ideas","PE investors typically write larger cheques and invest in mature, established firms to take on less structural risk","PE investors operate under direct oversight of the clearing corporation ledger"], correct: 2, explanation: "PE investors target mature, established businesses with proven revenue streams, deploying large capital for growth or buyouts. VCs take higher risk by funding early-stage startups with unproven business models." },
          { stem: "Apart from raising fresh CAPEX funds, what is another significant advantage a firm gains by going public via an IPO?", options: ["Gaining direct access to borrow interest-free cash from the RBI repo window","Eliminating all future corporate tax liabilities with the Ministry of Finance","Providing an exit route for early investors, rewarding employees via ESOPs, and improving visibility","Automatically protecting the stock from ever hitting a lower circuit limit"], correct: 2, explanation: "Beyond capital raising, an IPO provides early investors (VCs, PE firms) with a liquidity exit, allows employee ESOPs to be monetized, and significantly enhances the company's brand visibility and credibility." },
          { stem: "The structured process where a company collects investor bids at various price points within a designated price band to find the optimal issue price is called:", options: ["Earmarking for Settlement","Portfolio Benchmarking","Book Building","Capital Asset Allocation"], correct: 2, explanation: "Book Building is the IPO price discovery process — investors bid within the price band, and the final issue price (cut-off price) is determined based on demand aggregated across all bids." },
          { stem: "The highest price point a stock has ever traded since its primary stock exchange listing date is called its:", options: ["52-week High","All-time High","Upper Circuit Limit","Free Float Cap"], correct: 1, explanation: "The All-time High (ATH) is the highest price a stock has ever achieved since it began trading on the exchange. The 52-week high is a related but narrower metric covering only the past 12 months." },
          { stem: "A swing trader typically holds a market position for what duration?", options: ["Less than sixty seconds within a single morning session","Exactly until the end of the same trading day before market close","Anywhere from a few days to several weeks to capture price momentum","A minimum of ten consecutive calendar years to match retirement horizons"], correct: 2, explanation: "Swing trading involves holding positions for days to weeks, aiming to capture short-to-medium-term price moves. It sits between day trading (intraday) and long-term investing in terms of holding period." }
        ];
        await DB.put('topics', {
          module: 'stock-market-mcq',
          title: 'NRI Basics of Stock Market — Set 3',
          description: 'MCQ assessment (Set 3) covering advanced Zerodha features (DP charges, NRI accounts, BSDA, Console), corporate actions, RBI monetary policy, order types, CAPEX, SEBI objectives, and market concepts. 51 questions, 1 mark each.',
          scenario: '',
          checklist: set3Questions,
          bot_script: [],
          enabled: true,
          created_at: new Date().toISOString()
        });
      }
      if (!hasSet4) {
        const set4Questions = [
          { stem: "What is the maximum number of instruments that can be added to a single watchlist in Zerodha Kite?", options: ["25 instruments","50 instruments","75 instruments","100 instruments"], correct: 1, explanation: "Each watchlist in Kite supports up to 50 instruments. You can create up to 25 watchlists per account, giving a total capacity of 1,250 instrument slots across all watchlists." },
          { stem: "An After Market Order (AMO) placed through Zerodha is submitted to the exchange:", options: ["Immediately in an after-hours OTC session","At the start of the next trading day at 9:15 AM","At 3:30 PM on the same day as placement","Only if confirmed by the broker manually"], correct: 1, explanation: "AMOs are placed outside regular market hours and are queued for submission at the next day's market open (9:15 AM). They are useful for investors who cannot monitor markets during live trading hours." },
          { stem: "The 'ex-dividend date' for a stock means:", options: ["The date the company announces its dividend","The date the dividend is credited to shareholders","The cut-off date — buyers on or after this date do NOT receive the declared dividend","The date the dividend is recorded in company books"], correct: 2, explanation: "To receive a declared dividend, you must own the shares before the ex-dividend date. Buying on or after the ex-dividend date means you are not entitled to the current dividend." },
          { stem: "A Cover Order in Zerodha Kite is:", options: ["A standard market order with no conditions","An intraday order paired with a compulsory stop-loss, enabling higher leverage","A bracket order with both a target price and stop-loss","An order type available only for commodity instruments"], correct: 1, explanation: "A Cover Order pairs an entry order with a mandatory stop-loss, limiting broker risk and allowing Zerodha to offer higher intraday leverage compared to a plain MIS order." },
          { stem: "Under SEBI's Minimum Public Shareholding (MPS) rule, listed companies must maintain a minimum public float of:", options: ["10%","15%","25%","35%"], correct: 2, explanation: "SEBI mandates a minimum 25% public shareholding for all listed companies. Non-compliant companies must reduce promoter holdings via OFS, rights issues, or other SEBI-approved methods." },
          { stem: "An ELSS (Equity Linked Savings Scheme) fund has a mandatory lock-in period of:", options: ["1 year","2 years","3 years","5 years"], correct: 2, explanation: "ELSS has the shortest lock-in (3 years) among all Section 80C instruments. After lock-in, units can be freely redeemed. Investments up to Rs. 1.5 lakh per year qualify for Section 80C tax deduction." },
          { stem: "A Call option is 'In The Money' (ITM) when:", options: ["The option has no time value remaining","The strike price is above the current market price","The current market price is above the strike price","The option is trading at a loss"], correct: 2, explanation: "A Call option is ITM when the underlying's market price exceeds the strike price, giving it intrinsic value. Exercising an ITM call option yields an immediate gain before expiry." },
          { stem: "In Futures trading, 'Mark to Market' (MTM) settlement means:", options: ["Final settlement happens only at contract expiry","Unrealised P&L on open futures positions is settled in cash at the end of every trading day","The full contract value is blocked as margin upfront","Settlement is calculated against the 52-week average price"], correct: 1, explanation: "MTM requires daily cash settlement of gains and losses on open futures positions. This protects the clearing corporation from accumulated losses and requires traders to maintain adequate margin at all times." },
          { stem: "A 'Bulk Deal' on Indian stock exchanges is a transaction involving more than what percentage of a company's total shares?", options: ["0.5%","1%","2%","5%"], correct: 0, explanation: "SEBI defines a bulk deal as any single transaction exceeding 0.5% of a company's total equity shares. All bulk deals must be reported to the exchange by the end of the same trading day." },
          { stem: "A 'Block Deal' differs from a bulk deal because block deals:", options: ["Have no minimum quantity threshold","Are executed in a dedicated window (8:45–9:00 AM) within ±1% of the previous close, minimum Rs. 10 crore","Require prior SEBI approval before execution","Are restricted to domestic institutional investors only"], correct: 1, explanation: "Block deals are executed in a special pre-market window (8:45–9:00 AM) at prices within ±1% of the reference price, with a minimum transaction size of Rs. 10 crore per deal." },
          { stem: "When a stock hits its upper circuit limit during trading:", options: ["The stock is suspended for the rest of the day","Only sell orders are accepted — no new buy orders","Only buy orders are accepted — no new sell orders","The circuit limit automatically expands by 5%"], correct: 2, explanation: "At the upper circuit, the price cannot rise further. Buyers continue to place orders but no sellers offer shares at that level. Only buy orders queue — no sell orders execute." },
          { stem: "A 'Systematic Transfer Plan' (STP) in mutual funds allows an investor to:", options: ["Reinvest dividends automatically into more units","Periodically move a fixed amount from one fund (typically liquid/debt) into another (typically equity)","Withdraw units systematically at regular intervals","Transfer the entire corpus to another AMC at no cost"], correct: 1, explanation: "STP lets investors gradually deploy lump-sum money from a liquid/debt fund into an equity fund, combining capital safety with the rupee-cost averaging benefit of staggered equity investment." },
          { stem: "Dividend Yield of a stock is calculated as:", options: ["Annual Dividend per Share ÷ Current Market Price × 100","Total dividends paid ÷ Number of shares issued × 100","Annual Dividend per Share ÷ Face Value × 100","EPS × Dividend Payout Ratio × 100"], correct: 0, explanation: "Dividend Yield = (Annual Dividend per Share ÷ Current Market Price) × 100. It helps investors assess income return on their investment relative to the current stock price." },
          { stem: "For an NRI investor, which accounts allow complete, unrestricted repatriation of funds back abroad?", options: ["Only NRO accounts","Only NRE accounts","Both NRE and FCNR accounts","All NRI accounts without restriction"], correct: 2, explanation: "NRE (Non-Resident External) and FCNR (Foreign Currency Non-Resident) accounts are fully repatriable. NRO accounts have restricted repatriation — up to USD 1 million per year after applicable taxes." },
          { stem: "A 'New Fund Offer' (NFO) in mutual funds is:", options: ["A rights issue by an existing fund to existing unit holders","The first-time launch of a new fund scheme where units are offered at face value (typically Rs. 10)","A special offer where existing funds waive exit load for a limited period","A SEBI-mandated annual reset of fund NAV to Rs. 10"], correct: 1, explanation: "An NFO is a mutual fund's initial offering at face value (Rs. 10). After the NFO period closes, the fund invests the corpus and units trade at the evolving NAV based on portfolio performance." },
          { stem: "SEBI's Insider Trading Regulations prohibit trades based on:", options: ["Published quarterly earnings reports","Unpublished Price Sensitive Information (UPSI) not yet disclosed to the public","Broker research reports available on paid subscription","Technical chart analysis and price patterns"], correct: 1, explanation: "UPSI includes undisclosed merger plans, pre-announcement earnings data, regulatory outcomes, or any material non-public information. Trading on UPSI is a criminal offence under SEBI regulations." },
          { stem: "A company has 1 crore shares outstanding and EPS of Rs. 30. It issues a 2:1 bonus. The new EPS (profit unchanged) is:", options: ["Rs. 30","Rs. 15","Rs. 10","Rs. 60"], correct: 2, explanation: "A 2:1 bonus means 2 extra shares per 1 held — total shares triple from 1 crore to 3 crore. New EPS = Same Net Profit ÷ 3 crore shares = Rs. 30 ÷ 3 = Rs. 10 per share." },
          { stem: "The 'Price to Book Value' (P/BV) ratio is calculated as:", options: ["Market Price per Share ÷ Book Value per Share","Earnings per Share ÷ Book Value per Share","Market Capitalisation ÷ Annual Revenue","Net Profit ÷ Total Equity"], correct: 0, explanation: "P/BV = Market Price per Share ÷ Book Value per Share. A P/BV below 1 may suggest undervaluation; above 1 reflects the market's premium for intangibles, brand, and growth prospects." },
          { stem: "In a mutual fund, 'exit load' refers to:", options: ["An entry fee charged when you invest in the fund","A redemption fee charged if you exit the fund before a specified holding period","The fund manager's performance bonus deducted from returns","Annual GST charged on the expense ratio"], correct: 1, explanation: "Exit load is a penalty for early redemption, designed to discourage short-term trading in mutual funds. For example, a 1% exit load within 1 year means you receive 1% less of NAV on redemption." },
          { stem: "'Open Interest' rising while futures price is also rising typically indicates:", options: ["Existing positions are being squared off — bearish signal","New short positions are being added — bearish signal","New long positions are being added — bullish confirmation of uptrend","Market participants are reducing exposure neutrally"], correct: 2, explanation: "Rising Open Interest + Rising Price = new money flowing into long positions, confirming uptrend strength. Falling OI + Rising Price suggests short covering, a weaker bullish signal." },
          { stem: "The difference between 'Authorised Capital' and 'Paid-up Capital' of a company is:", options: ["Authorised capital is actual money received; paid-up capital is the maximum allowed","Authorised capital is the maximum share capital a company can issue; paid-up capital is what has actually been issued and paid for","They are the same term used in different regulatory contexts","Paid-up capital includes reserves; authorised capital does not"], correct: 1, explanation: "Authorised capital is the ceiling defined in the memorandum on how much share capital can be issued. Paid-up capital is the portion actually issued to and paid for by shareholders." },
          { stem: "A company's 'Return on Equity' (ROE) measures:", options: ["The percentage of revenue converted to profit","How efficiently a company generates profit from shareholders' equity","Dividend yield relative to book value","The ratio of operating profit to total assets"], correct: 1, explanation: "ROE = Net Profit ÷ Shareholders' Equity × 100. It shows how much profit is generated per rupee of equity. Higher ROE generally signals more efficient use of shareholder funds." },
          { stem: "Under SEBI's Takeover Code, a mandatory open offer is triggered when an acquirer's stake reaches or exceeds:", options: ["15%","25%","26%","51%"], correct: 1, explanation: "SEBI's Takeover Code requires a mandatory open offer to buy at least 26% more shares from public shareholders once the acquirer's holding reaches or crosses 25% in a listed company." },
          { stem: "An 'Offer for Sale' (OFS) is primarily used by:", options: ["The company to raise fresh capital for expansion","Existing shareholders (typically promoters) to sell their existing shares to the public","The exchange to list shares of unlisted subsidiaries","SEBI to divest shares in defaulting companies"], correct: 1, explanation: "OFS allows promoters or large shareholders to sell their existing stakes via the exchange platform. No fresh capital goes to the company in an OFS — only ownership is transferred." },
          { stem: "'Alpha' in investment returns represents:", options: ["The total annual return of a portfolio","The portion of return attributable to market movement","The excess return over a benchmark index, representing manager skill","The risk-free rate earned on government bonds"], correct: 2, explanation: "Alpha measures a portfolio's excess return relative to a benchmark. Alpha of +3% means the portfolio outperformed its benchmark by 3% — attributed to active management skill rather than market movement." },
          { stem: "Securities Transaction Tax (STT) on intraday equity trades (non-delivery) is charged at:", options: ["0.1% on both buy and sell sides","0.025% on the sell side only","0.05% on both buy and sell sides","0.1% on the sell side only"], correct: 1, explanation: "For intraday equity trades, STT is 0.025% on the sell side only. For delivery-based trades, STT is 0.1% on both buy and sell sides." },
          { stem: "A 'Debenture' issued by a company is:", options: ["A share of ownership with voting rights","A long-term debt instrument carrying a fixed interest rate","A government-guaranteed bond with no default risk","A derivative linked to the company's share price"], correct: 1, explanation: "Debentures are debt instruments issued by companies to raise loans. Debenture holders are creditors (not owners) and receive fixed interest (coupon) irrespective of company profits." },
          { stem: "What happens to a share price on the ex-dividend date, all else being equal?", options: ["It rises by the dividend amount as demand increases","It remains unchanged as dividends are paid from profits","It falls approximately by the dividend amount since the stock now trades without the dividend entitlement","It is frozen by the exchange until dividend is paid out"], correct: 2, explanation: "On the ex-dividend date, the stock price theoretically drops by the dividend amount as new buyers are no longer entitled to it. This is a mechanical adjustment, not a sign of poor company performance." },
          { stem: "'Compulsory Delisting' of a stock from an exchange occurs when:", options: ["The stock price falls below Rs. 1 for 30 consecutive days","SEBI or the exchange orders removal due to regulatory non-compliance, fraud, or prolonged non-operation","The promoter's holding exceeds 75% for two consecutive quarters","Market cap falls below the exchange minimum threshold for 90 days"], correct: 1, explanation: "Compulsory delisting is ordered by SEBI/exchange when a company fails to comply with listing norms, commits fraud, or fails to make required disclosures. It differs from voluntary (promoter-initiated) delisting." },
          { stem: "Dollar Cost Averaging (DCA) as an investment strategy involves:", options: ["Only investing when a target currency strengthens","Investing a fixed amount at regular intervals regardless of current price","Doubling investment each time the stock falls 10%","Waiting to invest only at a specific target price"], correct: 1, explanation: "DCA (Rupee Cost Averaging in Indian context) invests a fixed amount at regular intervals. When prices are low, more units are bought; when high, fewer. This smoothens entry cost over time." },
          { stem: "The Nifty Midcap 150 index tracks companies ranked:", options: ["1st to 150th by market cap on NSE","101st to 250th by full market capitalisation on NSE","Any 150 NSE companies not in Nifty 50","150 companies by trading volume, not market cap"], correct: 1, explanation: "Nifty Midcap 150 covers companies ranked 101–250 by full market cap, consistent with SEBI's categorisation: Top 100 = Large Cap, 101–250 = Mid Cap, beyond 250 = Small Cap." },
          { stem: "Pledging shares with a broker allows an investor to:", options: ["Transfer ownership of shares to the broker permanently","Use existing shareholdings as collateral to get additional trading margin without selling the shares","Earn interest on idle shares parked with the broker","Enable automatic dividend reinvestment"], correct: 1, explanation: "Pledging creates a lien on shares — ownership stays with the investor, but the broker can use them as margin collateral. If margin is not maintained, the broker can sell pledged shares to recover dues." },
          { stem: "A 'Rights Entitlement' (RE) that is tradeable on stock exchanges means:", options: ["Promoters have the right to retain their holding during an IPO","Shareholders can sell their rights entitlement to third parties who can then subscribe to the rights issue","A government certificate confirming investor rights compliance","A SEBI-mandated lock-in on rights issue shares"], correct: 1, explanation: "SEBI introduced tradeable Rights Entitlements so shareholders unwilling to subscribe can sell their entitlement. Buyers of REs can then exercise those rights to subscribe to shares in the issue." },
          { stem: "The 'Price Band' in a book-built IPO refers to:", options: ["The maximum and minimum price the stock can trade at on listing day","The floor and ceiling price within which investors bid during the IPO","SEBI's mandated fair price range based on P/E ratio","The range between face value and IPO premium"], correct: 1, explanation: "In a book-built IPO, SEBI allows a price band (floor to cap) of up to 20%. Investors bid within this range; the final issue (cut-off) price is the highest price at which the issue is fully subscribed." },
          { stem: "A Registrar and Transfer Agent (RTA) in an IPO is responsible for:", options: ["Setting the IPO price after collecting bids","Managing share allotment, maintaining the investor register, and processing refunds","Acting as the lead merchant banker managing the full IPO","Approving IPO filings on behalf of SEBI"], correct: 1, explanation: "RTAs (e.g., KFin Technologies, Link Intime) handle post-IPO operations: processing applications, allotting shares, crediting shares to demat accounts, and processing refunds for unsuccessful applicants." },
          { stem: "A mutual fund's Total Expense Ratio (TER) of 1.5% per annum means:", options: ["1.5% of invested amount is charged upfront as a one-time fee","1.5% of investment is deducted annually in a lump sum","~0.004% is deducted daily from the fund's gross assets, reducing the NAV slightly each day","Your returns are capped at benchmark return minus 1.5%"], correct: 2, explanation: "TER is applied daily: 1.5% ÷ 365 ≈ 0.004% per day. It is deducted from the fund's total assets, reducing the NAV incrementally. Investors never pay it directly — it is embedded in the NAV." },
          { stem: "A stock's '52-Week High' is:", options: ["The highest price the stock has ever traded since listing","The highest traded price over the past 52 weeks (approximately one year)","The highest price at which promoters bought shares in the last year","The highest price approved by SEBI for the stock in the past year"], correct: 1, explanation: "The 52-week high is the highest price traded in the last 52 weeks. Stocks near their 52-week high are often used as indicators of relative strength and momentum." },
          { stem: "A company has a Debt-to-Equity (D/E) ratio of 0. This means:", options: ["The company is highly leveraged with maximum debt","The company has zero debt — entirely equity-financed","Debt and equity are equal","The company has not issued any equity shares"], correct: 1, explanation: "A D/E of 0 means no debt. While this implies low financial risk, it may mean the company is foregoing the tax benefit of debt (interest is tax-deductible). Optimal D/E varies widely by industry." },
          { stem: "The Clearing Corporation for NSE trades in India is:", options: ["CDSL (Central Depository Services Limited)","NSDL (National Securities Depository Limited)","NSE Clearing Limited (formerly NSCCL)","SEBI's Settlement Division"], correct: 2, explanation: "NSE Clearing Limited (formerly NSCCL) is the clearing corporation for all NSE trades. It acts as the central counterparty — becoming the buyer to every seller and seller to every buyer, guaranteeing settlement." },
          { stem: "If a stock's P/E is significantly lower than its industry peers, it may indicate:", options: ["The stock is definitely overvalued and should be sold","Potential undervaluation relative to peers — or genuine concerns about growth prospects, requiring further analysis","The company is paying higher dividends than peers","The company's EPS is higher than the sector average"], correct: 1, explanation: "A low P/E vs peers could signal undervaluation (an opportunity) or reflect legitimate concerns about earnings quality or growth. Context and fundamental analysis are always essential before concluding." },
          { stem: "'Free Cash Flow' (FCF) for a company is:", options: ["Cash held in the company's current account","Operating cash flow minus capital expenditure — cash available to return to shareholders or reinvest","Total cash raised through IPOs and rights issues in a year","Revenue minus all operating costs before tax"], correct: 1, explanation: "FCF = Operating Cash Flow − CAPEX. It is the genuine surplus cash generated after sustaining and growing the asset base, and is a key metric for assessing dividend sustainability and company valuation." },
          { stem: "Under SEBI's Takeover Code, what is the minimum percentage an acquirer must offer to buy from public shareholders in a mandatory open offer?", options: ["10%","15%","26%","51%"], correct: 2, explanation: "In a mandatory open offer triggered by crossing the 25% threshold, the acquirer must offer to buy at least 26% of total shares from public shareholders, giving them a fair exit at a SEBI-regulated price." },
          { stem: "A 'Liquid Fund' in the mutual fund category primarily invests in:", options: ["Large-cap equity shares of highly liquid companies","Very short-term money market instruments with maturity up to 91 days","Long-term government bonds with active secondary market trading","A balanced mix of equity and short-term debt"], correct: 1, explanation: "Liquid funds invest in money market instruments (T-bills, CPs, CDs) maturing within 91 days. They offer high safety, minimal volatility, and quick redemption — ideal for parking short-term surplus funds." },
          { stem: "What is 'Scalping' in trading?", options: ["Making very short-term trades (seconds to minutes) to profit from tiny price movements, closing all positions within minutes","Buying stocks during results season and holding for exactly one quarter","Short selling stocks and covering at the end of each week","A SEBI-prohibited arbitrage strategy between NSE and BSE prices"], correct: 0, explanation: "Scalpers execute dozens or hundreds of trades daily targeting micro price movements, holding for seconds to minutes. This requires ultra-fast execution, tight spreads, and very high transaction volumes." },
          { stem: "A 'Qualified Institutional Buyer' (QIB) in Indian capital markets is:", options: ["Any retail investor with a net worth above Rs. 2 crore","SEBI-registered institutional entities (mutual funds, FIIs, insurance companies, banks) deemed financially sophisticated","Companies with paid-up capital above Rs. 100 crore","Brokers with more than Rs. 50 crore in client AUM"], correct: 1, explanation: "QIBs include mutual funds, FIIs/FPIs, SEBI-registered VCs, insurance companies, and scheduled commercial banks. They receive 50% of IPO allocation and are considered sophisticated enough to need fewer protections." },
          { stem: "The 'Holding Period Return' (HPR) of an investment is:", options: ["(Ending Value + Dividends − Beginning Value) ÷ Beginning Value × 100","Only the capital gain portion, excluding dividends received","Annual return compounded over the holding period","Ending Value ÷ CAGR of the benchmark index"], correct: 0, explanation: "HPR = (Ending Value + Dividends − Beginning Value) ÷ Beginning Value × 100. It captures total return over any holding period, combining price appreciation and income received." },
          { stem: "In an IPO, 'Anchor Investors' are:", options: ["Retail investors who apply for maximum lots in every IPO","SEBI-approved large QIBs who subscribe before the IPO opens at a fixed price, signalling confidence in the issue","The lead merchant banker who anchors the IPO process","NRI investors providing anchor capital through a fixed-rate bond"], correct: 1, explanation: "Anchor investors (large mutual funds, FIIs) subscribe before the IPO opens, at the final issue price. Their participation signals institutional confidence and helps stabilise demand for the offering." },
          { stem: "'Systematic Risk' in investing refers to:", options: ["Risk specific to one company due to its business or management","Market-wide risk affecting all securities that cannot be eliminated through diversification (e.g., recession, rate hikes)","The risk of a broker defaulting on client funds","Operational risk from T+1 settlement failures"], correct: 1, explanation: "Systematic risk (market risk) is undiversifiable — it affects the entire market. Examples include interest rate changes, inflation, recessions, and geopolitical events. It is measured using Beta." },
          { stem: "When a company undergoes 'Voluntary Delisting', the exit price for shareholders is determined by:", options: ["At least the face value of the shares","A reverse book-building process where 90% of public shareholders must tender shares before the price is accepted","The previous 6-month average market price set by the exchange","The IPO price plus simple interest at 8% per annum"], correct: 1, explanation: "In voluntary delisting, SEBI mandates a reverse book-building process. The discovered price is accepted only if 90% of public shareholders tender their shares, protecting minority investors from a forced below-market exit." }
        ];
        await DB.put('topics', {
          module: 'stock-market-mcq',
          title: 'NRI Basics of Stock Market — Set 4',
          description: 'MCQ assessment (Set 4) covering moderate concepts: AMO, cover orders, ELSS, ITM options, MTM settlement, block deals, STP, dividend yield, NRI accounts, insider trading, P/BV, ROE, SEBI takeover code, OFS, alpha, STT, debentures, F&O open interest, DCA, midcap indices, pledging, rights entitlement, TER, FCF, liquid funds, QIBs, HPR, anchor investors, systematic risk. 50 questions, 1 mark each.',
          scenario: '',
          checklist: set4Questions,
          bot_script: [],
          enabled: true,
          created_at: new Date().toISOString()
        });
      }
      if (!silent) toast('✅ NRI Stock Market topics seeded! Sets are now live.', 'success');
      await seedManagerTopics();
    renderTopicsList();
    } catch (e) {
      if (!silent) toast('❌ Seed failed: ' + e.message, 'error');
      else console.error('SMQ auto-seed failed:', e.message);
    }
  }

    // ---- Matches Module Filter Helper ----
  function matchesModuleFilter(itemModule, filterModule) {
    if (!filterModule || filterModule === 'all') return true;
    if (itemModule === filterModule) return true;
    if (filterModule === 'pick-speak' && (itemModule === 'pick-speak-stock' || itemModule === 'pick-speak-general' || itemModule === 'pick-speak')) return true;
    if ((filterModule === 'pick-speak-stock' || filterModule === 'pick-speak-general') && itemModule === 'pick-speak') return true;
    // NOTE: Ops Escalation Call/Writing used to be folded into the Mock Call /
    // Written Comm tabs here (same screens/scoring shape as those modules).
    // That caused a real incident: an admin managing "Mock Call" topics could
    // not tell that toggling a card in that same tab was actually disabling
    // the ONLY Ops Escalation Call topic (a different, separate module on the
    // trainee side), so trainees got "no topics available" for Ops Escalation
    // Call while Mock Call itself looked fine. They now have their own
    // dedicated tab buttons (see admin.html) so each module's enabled state
    // is only ever managed on its own tab.
    return false;
  }

  // ---- Topics Management ----
  async function seedManagerTopics() {
    try {
      await DB.init();
      if (typeof DB.seedManagerTopics === 'function') {
        await DB.seedManagerTopics();
      }
    } catch (e) {
      console.warn('seedManagerTopics failed:', e);
    }
  }

  async function renderTopicsList() {
    const container = $('topics-list');
    if (!container) return;

    if (!_topicsFilter) {
      container.innerHTML = '<div class="empty-state" style="grid-column:1/-1;padding:2rem;text-align:center;color:var(--text-muted)">Pick Manager or Trainee above, then a module, to see its topics.</div>';
      return;
    }

    try {
      await DB.init();
      // NOTE: this used to be gated behind "only seed if zero mgr- topics
      // exist at all", which meant a single partially-seeded module (or
      // one legacy row) would permanently block the rest from ever being
      // added. seedManagerTopics()/DB.seedManagerTopics() is now per-title
      // and idempotent (see db.js), so it's safe — and necessary — to just
      // call it every time this tab renders, so newly-added manager
      // modules always get picked up without a manual "force reseed".
      await seedManagerTopics();
      const allTopics = await DB.getAll('topics');
      const filtered = allTopics.filter(t => matchesModuleFilter(t.module, _topicsFilter));

      if (!filtered.length) {
        container.innerHTML = '<div class="empty-state" style="grid-column:1/-1;padding:2rem;text-align:center;color:var(--text-muted)">No topics found. Create one with + New Topic.</div>';
        return;
      }

      container.innerHTML = filtered.map(t => {
        const isEnabled = t.enabled !== false;
        const desc = t.description || t.scenario || '';
        const shortDesc = desc.length > 120 ? desc.substring(0, 120) + '…' : desc;
        const questionCount = Array.isArray(t.botScript) ? t.botScript.length : 0;

        return `
          <div class="topic-card ${!isEnabled ? 'disabled' : ''}" style="background:#fff;border:1px solid var(--border-color,#e2e8f0);border-radius:8px;padding:1rem;display:flex;flex-direction:column;justify-content:space-between">
            <div>
              <div class="topic-card-header" style="display:flex;justify-content:space-between;align-items:center;gap:0.5rem;margin-bottom:0.6rem">
                <span style="display:flex;align-items:center;gap:0.35rem">${moduleBadge(t.module || 'pick-speak')}${(typeof mgrIsDemoTitle === 'function' && mgrIsDemoTitle(t.title)) ? '<span style="font-size:0.68rem;font-weight:800;background:#fef3c7;color:#92400e;border:1px solid #fcd34d;border-radius:4px;padding:0.1rem 0.4rem">🎓 DEMO</span>' : ''}</span>
                <button class="btn-small ${isEnabled ? 'primary' : 'ghost'}" style="font-size:0.75rem;padding:0.2rem 0.5rem" onclick="Admin.toggleTopicEnabled('${t.id}')">
                  ${isEnabled ? '✅ Enabled' : '⏸ Disabled'}
                </button>
              </div>
              <h3 class="topic-card-title" style="font-size:1rem;font-weight:600;margin-bottom:0.4rem;color:var(--text-main,#1e293b)">${t.title || 'Untitled Topic'}</h3>
              ${questionCount > 0 ? `<div style="font-size:0.78rem;font-weight:600;color:#4338ca;margin-bottom:0.4rem">🗨 ${questionCount} question${questionCount === 1 ? '' : 's'} in bot script</div>` : ''}
              <p class="topic-card-desc" style="font-size:0.85rem;color:var(--text-muted,#64748b);line-height:1.4;margin-bottom:0.8rem">${shortDesc || 'No description'}</p>
            </div>
            <div class="topic-card-actions" style="display:flex;gap:0.4rem;margin-top:0.5rem">
              <button class="btn-small" onclick="Admin.openTopicModal('${t.id}')">✏️ Edit</button>
              <button class="btn-small danger" onclick="Admin.deleteTopic('${t.id}')">🗑 Delete</button>
            </div>
          </div>
        `;
      }).join('');
    } catch (e) {
      console.error('[Admin] renderTopicsList failed:', e);
      container.innerHTML = `<div class="empty-state" style="grid-column:1/-1;color:var(--danger)">Failed to load topics: ${e.message}</div>`;
    }
  }

  // Topics page navigation: group chooser (Manager/Trainee) -> that group's
  // module pills -> topics for the picked module. Replaces the old single
  // flat pill strip mixing every trainee AND manager module (plus a global
  // "All" pill) on one screen.
  function selectTopicsGroup(group) {
    _topicsGroup  = group;
    _topicsFilter = null;
    const chooser = $('topics-group-chooser');
    const tabsEl  = $('topics-module-tabs');
    if (chooser) chooser.style.display = 'none';
    if (tabsEl) {
      const tabs = TOPICS_GROUP_TABS[group] || [];
      const tabBtn = t => `<button class="tab-btn" data-module="${t.module}" onclick="Admin.selectTopicsModule('${t.module}')">${t.label}</button>`;
      tabsEl.style.display = '';
      tabsEl.innerHTML =
        `<button class="tab-btn" onclick="Admin.backToTopicsGroups()">← Back</button>` +
        tabs.map(tabBtn).join('') +
        // Manager -> its own titled "NRI Manager" section holding the NRI
        // team's three assessments (own row under a heading).
        (group === 'manager'
          ? `<div style="flex-basis:100%;height:0"></div>` +
            `<div style="flex-basis:100%;font-size:0.78rem;font-weight:800;letter-spacing:0.06em;color:#0f766e;margin:0.6rem 0 0.1rem">NRI MANAGER</div>` +
            (TOPICS_GROUP_TABS.nriManager || []).map(tabBtn).join('')
          : '');
    }
    renderTopicsList();
  }

  function backToTopicsGroups() {
    _topicsGroup  = null;
    _topicsFilter = null;
    const chooser = $('topics-group-chooser');
    const tabsEl  = $('topics-module-tabs');
    if (chooser) chooser.style.display = '';
    if (tabsEl) { tabsEl.style.display = 'none'; tabsEl.innerHTML = ''; }
    renderTopicsList();
  }

  function selectTopicsModule(module) {
    _topicsFilter = module;
    document.querySelectorAll('#topics-module-tabs .tab-btn[data-module]').forEach(b => {
      b.classList.toggle('active', b.getAttribute('data-module') === module);
    });
    renderTopicsList();
  }

  function initTopics() {
    const newBtn = $('btn-new-topic');
    if (newBtn) {
      newBtn.onclick = () => openTopicModal();
    }

    const closeBtn = $('btn-close-topic-modal');
    if (closeBtn) closeBtn.onclick = closeTopicModal;

    const cancelBtn = $('btn-cancel-topic');
    if (cancelBtn) cancelBtn.onclick = closeTopicModal;

    const saveBtn = $('btn-save-topic');
    if (saveBtn) saveBtn.onclick = saveTopic;

    const addChecklistBtn = $('btn-add-checklist');
    if (addChecklistBtn) addChecklistBtn.onclick = () => _addChecklistRow('');

    const addBotLineBtn = $('btn-add-bot-line');
    if (addBotLineBtn) addBotLineBtn.onclick = () => _addBotScriptRow('');

    const addTaTurnBtn = $('btn-add-ta-turn');
    if (addTaTurnBtn) addTaTurnBtn.onclick = () => _addTaTurnRow('', '');

    const addThinkAboutBtn = $('btn-add-think-about');
    if (addThinkAboutBtn) addThinkAboutBtn.onclick = () => _addThinkAboutRow('');

    const modSelect = $('topic-module');
    if (modSelect) modSelect.onchange = () => _updateTopicModalFieldsForModule(modSelect.value);
  }

  // ---- Topic modal: MCQ-shaped modules keep their questions in `checklist`
  // in a different shape than the plain string list used everywhere else,
  // so the generic checklist/bot-script editors below are hidden for them
  // (their data is preserved on save rather than edited here).
  const MCQ_SHAPED_MODULES = new Set(['grammar-assessment', 'listening-assessment', 'stock-market-mcq']);

  // Modules whose `scenario` text has enough internal structure that a
  // segregated editor (see the parse/build functions above) is worth
  // showing instead of one flat textarea -- per the manager's 2026-09-24
  // request. Mock Call and EQ scenarios don't have this kind of repeatable
  // internal structure (EQ especially -- 3 sections x persona/situation/
  // goodLooksLike/commonPitfalls each -- so segregating it wouldn't reduce
  // to a few flat fields without a much bigger editor than the benefit
  // justifies, since editing it here still has zero effect on the live,
  // fully-hardcoded assessment either way); they keep the plain textarea.
  const STRUCTURED_SCENARIO_MODULES = new Set(['mgr-situation-room', 'mgr-transcript-autopsy', 'mgr-feedback']);

  // NRI module keys behave as their base assessment (see mgrBaseModule in
  // js/mgr-eval-criteria.js), so every "which editor / which layout" check
  // below asks for the base key.
  const _baseMod = (m) => (typeof mgrBaseModule === 'function' ? mgrBaseModule(m) : m);
  // Modules whose topics carry an Internal Data section (client-context
  // box shown to the manager): Situation Room, Transcript Autopsy, Paper
  // Trade -- regular and NRI.
  const INTERNAL_DATA_MODULES = new Set(['mgr-situation-room', 'mgr-transcript-autopsy', 'mgr-mock-call']);
  const _isDemoCapable = (m) => /^mgr-/.test(m) && !['mgr-listening-tone', 'mgr-management-skills'].includes(m);

  function _updateTopicModalFieldsForModule(rawModule) {
    const module = _baseMod(rawModule);
    const isMcq = MCQ_SHAPED_MODULES.has(module);
    const mcqGroup        = $('topic-mcq-group');
    const checklistGroup  = $('topic-checklist-group');
    const botScriptGroup  = $('topic-bot-script-group');
    const callerAudioGroup = $('topic-caller-audio-group');
    const scenarioGroup   = $('topic-scenario-group');
    const srGroup         = $('topic-sr-group');
    const taGroup         = $('topic-ta-group');
    const fbGroup         = $('topic-fb-group');
    if (scenarioGroup) scenarioGroup.style.display = STRUCTURED_SCENARIO_MODULES.has(module) ? 'none' : '';
    if (srGroup) srGroup.style.display = module === 'mgr-situation-room'    ? '' : 'none';
    if (taGroup) taGroup.style.display = module === 'mgr-transcript-autopsy' ? '' : 'none';
    if (fbGroup) fbGroup.style.display = module === 'mgr-feedback'          ? '' : 'none';
    const internalGroup = $('topic-internal-group');
    if (internalGroup) internalGroup.style.display = INTERNAL_DATA_MODULES.has(module) ? '' : 'none';
    const demoGroup = $('topic-demo-group');
    if (demoGroup) demoGroup.style.display = _isDemoCapable(rawModule) ? '' : 'none';
    if (mcqGroup) mcqGroup.style.display = isMcq ? '' : 'none';
    // Checklist is unused/always-empty for these 3 structured modules
    // (Feedback's reflection questions now live in the dedicated Think
    // About list above) -- hide it there to avoid a redundant empty field.
    if (checklistGroup) checklistGroup.style.display = (isMcq || STRUCTURED_SCENARIO_MODULES.has(module)) ? 'none' : '';
    if (botScriptGroup)   botScriptGroup.style.display  = isMcq ? 'none' : '';
    if (callerAudioGroup) callerAudioGroup.style.display = (module === 'mock-call' || module === 'ops-call-assessment') ? '' : 'none';
  }

  // ---- Generic single-line string-list editor (add/remove rows) --------
  // Originally hardcoded to the Evaluation Checklist field only; generalized
  // 2026-09-24 so the same add/remove-row pattern can back the Red Pen
  // "Think About" question list too, without duplicating this UI logic.
  function _renderSimpleListEditor(containerId, items, inputClass) {
    const container = $(containerId);
    if (!container) return;
    container.innerHTML = '';
    (items || []).forEach(val => _addSimpleListRow(containerId, val, inputClass));
  }
  function _addSimpleListRow(containerId, value, inputClass) {
    const container = $(containerId);
    if (!container) return;
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:0.4rem;margin-bottom:0.4rem;align-items:center';
    const input = document.createElement('input');
    input.type = 'text';
    input.className = inputClass;
    input.style.cssText = 'flex:1';
    input.value = value || '';
    const rmBtn = document.createElement('button');
    rmBtn.type = 'button';
    rmBtn.className = 'btn-ghost small';
    rmBtn.textContent = '✕';
    rmBtn.onclick = () => row.remove();
    row.appendChild(input);
    row.appendChild(rmBtn);
    container.appendChild(row);
  }
  function _getSimpleListValues(containerId, inputClass) {
    return Array.from(document.querySelectorAll(`#${containerId} .${inputClass}`))
      .map(el => el.value.trim())
      .filter(Boolean);
  }

  // ---- Checklist editor (plain string list — evaluation checklist) ----
  function _renderChecklistEditor(items) {
    _renderSimpleListEditor('checklist-items', items, 'checklist-item-input');
  }
  function _addChecklistRow(value) {
    _addSimpleListRow('checklist-items', value, 'checklist-item-input');
  }
  function _getChecklistValues() {
    return _getSimpleListValues('checklist-items', 'checklist-item-input');
  }

  // ---- Think About editor (Red Pen only — reflection questions list) --
  function _renderThinkAboutEditor(items) {
    _renderSimpleListEditor('think-about-items', items, 'think-about-item-input');
  }
  function _addThinkAboutRow(value) {
    _addSimpleListRow('think-about-items', value, 'think-about-item-input');
  }
  function _getThinkAboutValues() {
    return _getSimpleListValues('think-about-items', 'think-about-item-input');
  }

  // ---- Structured scenario parsing/reconstruction ----------------------
  // The DB `scenario` field stays a single string (the live app's own
  // parsers -- _renderAutopsyTranscript, the Situation Room Part A/B split,
  // etc. -- all expect that one string, unchanged). These just let admin
  // edit that string through separate labelled fields instead of one big
  // undifferentiated textarea, parsing it apart on open and reassembling
  // the exact same format on save.

  // Situation Room: "<situation>\n\nPart A — ...\nPart B — ...\n\n───
  // THE WRONG RESPONSE (given to the manager to critique) ───\n\n"<text>""
  const SR_WRONG_MARKER = '─── THE WRONG RESPONSE (given to the manager to critique) ───';
  function _parseSrScenario(text) {
    text = text || '';
    const partAIdx = text.indexOf('\n\nPart A —');
    const situation = partAIdx !== -1 ? text.slice(0, partAIdx).trim() : text.trim();
    const wrongIdx = text.indexOf(SR_WRONG_MARKER);
    const wrongResponse = wrongIdx !== -1
      ? text.slice(wrongIdx + SR_WRONG_MARKER.length).trim().replace(/^"|"$/g, '')
      : '';
    return { situation, wrongResponse };
  }
  function _buildSrScenario(situation, wrongResponse) {
    return `${(situation || '').trim()}\n\nPart A — What Would You Say? Write your full verbal response, opening to close.\nPart B — The Wrong Response: A flawed manager reply to this situation follows below. Identify every error, explain the impact of each, and rewrite the response correctly.\n\n${SR_WRONG_MARKER}\n\n"${(wrongResponse || '').trim()}"`;
  }

  // Transcript Autopsy: "<background>\n\n─── CALL TRANSCRIPT ───\n\nCLIENT:
  // "..."\n\nMANAGER: "..."\n\n..." (repeating CLIENT/MANAGER pairs)
  const TA_TRANSCRIPT_MARKER = /─{3,}\s*CALL TRANSCRIPT\s*─{3,}/i;
  function _parseTaScenario(text) {
    text = text || '';
    const idx = text.search(TA_TRANSCRIPT_MARKER);
    if (idx === -1) return { background: text.trim(), turns: [] };
    const background = text.slice(0, idx).trim();
    const markerMatch = text.match(TA_TRANSCRIPT_MARKER);
    const after = text.slice(idx + markerMatch[0].length).trim();
    const turnRe = /(CLIENT|MANAGER):\s*/g;
    const matches = [...after.matchAll(turnRe)];
    const lines = matches.map((m, i) => {
      const start = m.index + m[0].length;
      const end = (i + 1 < matches.length) ? matches[i + 1].index : after.length;
      return { speaker: m[1], text: after.slice(start, end).trim().replace(/^"|"$/g, '') };
    });
    const turns = [];
    let pending = null;
    lines.forEach(l => {
      if (l.speaker === 'CLIENT') {
        if (pending) turns.push(pending);
        pending = { client: l.text, manager: '' };
      } else {
        if (!pending) pending = { client: '', manager: '' };
        pending.manager = l.text;
      }
    });
    if (pending) turns.push(pending);
    return { background, turns };
  }
  function _buildTaScenario(background, turns) {
    const body = (turns || [])
      .filter(t => t.client || t.manager)
      .map(t => `CLIENT: "${(t.client || '').trim()}"\n\nMANAGER: "${(t.manager || '').trim()}"`)
      .join('\n\n');
    return `${(background || '').trim()}\n\n─── CALL TRANSCRIPT ─────────────────────────────────────────────\n\n${body}`;
  }

  // Feedback (Red Pen): "<situation>\n\nThink About:\n- q1\n- q2\n..."
  const FB_THINK_ABOUT_MARKER = '\n\nThink About:\n';
  function _parseFbScenario(text) {
    text = text || '';
    const idx = text.indexOf(FB_THINK_ABOUT_MARKER);
    const situation = idx !== -1 ? text.slice(0, idx).trim() : text.trim();
    const thinkAbout = idx !== -1
      ? text.slice(idx + FB_THINK_ABOUT_MARKER.length).trim().split('\n').map(l => l.replace(/^-\s*/, '').trim()).filter(Boolean)
      : [];
    return { situation, thinkAbout };
  }
  function _buildFbScenario(situation, thinkAbout) {
    const items = (thinkAbout || []).filter(q => q && q.trim()).map(q => `- ${q.trim()}`).join('\n');
    return `${(situation || '').trim()}${items ? `${FB_THINK_ABOUT_MARKER}${items}` : ''}`;
  }

  // ---- Transcript Autopsy turn-pair editor (Client + Manager per row) --
  function _renderTaTurnsEditor(turns) {
    const container = $('ta-turn-items');
    if (!container) return;
    container.innerHTML = '';
    const list = (turns && turns.length) ? turns : [{ client: '', manager: '' }];
    list.forEach(t => _addTaTurnRow(t.client, t.manager));
  }
  function _addTaTurnRow(client, manager) {
    const container = $('ta-turn-items');
    if (!container) return;
    const row = document.createElement('div');
    row.className = 'ta-turn-row';
    row.style.cssText = 'border:1px solid var(--border,#e5e7eb);border-radius:8px;padding:0.6rem;margin-bottom:0.6rem';
    row.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.3rem">
        <span style="font-size:0.72rem;font-weight:700;color:#475569;letter-spacing:0.04em">TURN</span>
        <button type="button" class="btn-ghost small ta-turn-remove">✕</button>
      </div>
      <label style="font-size:0.75rem;color:var(--text-muted);display:block;margin-bottom:0.2rem">Client says</label>
      <textarea class="ta-turn-client" style="min-height:50px;width:100%"></textarea>
      <label style="font-size:0.75rem;color:var(--text-muted);display:block;margin:0.4rem 0 0.2rem">Manager says</label>
      <textarea class="ta-turn-manager" style="min-height:50px;width:100%"></textarea>
    `;
    row.querySelector('.ta-turn-client').value = client || '';
    row.querySelector('.ta-turn-manager').value = manager || '';
    row.querySelector('.ta-turn-remove').onclick = () => row.remove();
    container.appendChild(row);
  }
  function _getTaTurnValues() {
    return Array.from(document.querySelectorAll('#ta-turn-items .ta-turn-row')).map(row => ({
      client: row.querySelector('.ta-turn-client').value.trim(),
      manager: row.querySelector('.ta-turn-manager').value.trim(),
    })).filter(t => t.client || t.manager);
  }

  // ---- Bot script editor (one textarea per customer turn — may contain
  // HTML, e.g. the "Key details" data block markup used by the Ops
  // Escalation topics, so it's edited as raw source text here) ----
  function _renderBotScriptEditor(items) {
    const container = $('bot-script-items');
    if (!container) return;
    container.innerHTML = '';
    (items || []).forEach(val => _addBotScriptRow(val));
  }
  function _addBotScriptRow(value) {
    const container = $('bot-script-items');
    if (!container) return;
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:0.4rem;margin-bottom:0.5rem;align-items:flex-start';
    const label = document.createElement('div');
    label.textContent = `Q${container.children.length + 1}`;
    label.style.cssText = 'font-size:0.75rem;font-weight:700;color:var(--text-muted,#64748b);padding-top:0.4rem;min-width:1.6rem';
    const ta = document.createElement('textarea');
    ta.className = 'bot-script-item-input';
    ta.style.cssText = 'flex:1;min-height:90px;font-size:0.82rem;font-family:inherit;line-height:1.4';
    ta.value = value || '';
    const rmBtn = document.createElement('button');
    rmBtn.type = 'button';
    rmBtn.className = 'btn-ghost small';
    rmBtn.style.marginTop = '0.2rem';
    rmBtn.textContent = '✕';
    rmBtn.onclick = () => { row.remove(); _renumberBotScriptRows(); };
    row.appendChild(label);
    row.appendChild(ta);
    row.appendChild(rmBtn);
    container.appendChild(row);
  }
  function _renumberBotScriptRows() {
    const container = $('bot-script-items');
    if (!container) return;
    Array.from(container.children).forEach((row, idx) => {
      const label = row.querySelector('div');
      if (label) label.textContent = `Q${idx + 1}`;
    });
  }
  function _getBotScriptValues() {
    return Array.from(document.querySelectorAll('#bot-script-items .bot-script-item-input'))
      .map(el => el.value.trim())
      .filter(Boolean);
  }

  function closeTopicModal() {
    const modal = $('topic-modal');
    if (modal) modal.classList.add('hidden');
    _editTopicId = null;
  }

  async function openTopicModal(topicId = null) {
    _editTopicId = topicId;
    const modal = $('topic-modal');
    if (!modal) return;

    const titleEl = $('topic-modal-title');
    const modSelect = $('topic-module');
    const inputTitle = $('topic-title');
    const inputDesc = $('topic-description');
    const inputScen = $('topic-scenario');

    if (topicId) {
      if (titleEl) titleEl.textContent = 'Edit Topic';
      const t = await DB.get('topics', topicId);
      if (t) {
        const module = t.module || 'pick-speak';
        if (modSelect) modSelect.value = module;
        if (inputTitle) inputTitle.value = t.title || '';
        if (inputDesc) inputDesc.value = t.description || '';
        // Internal Data lives after a marker at the end of the same
        // scenario string; split it off first so the situation / transcript
        // / wrong-response parsers below only see the situation text.
        const split = (typeof mgrSplitInternalData === 'function')
          ? mgrSplitInternalData(t.scenario)
          : { text: t.scenario || '', internalData: '' };
        const scenText = split.text;
        if ($('topic-internal-data')) $('topic-internal-data').value = split.internalData;
        if ($('topic-demo-flag')) $('topic-demo-flag').checked = (typeof mgrIsDemoTitle === 'function') && mgrIsDemoTitle(t.title);
        if (inputScen) inputScen.value = scenText;
        _renderChecklistEditor(t.checklist || []);
        _renderBotScriptEditor(t.botScript || t.bot_script || []);
        // Segregated fields (see _updateTopicModalFieldsForModule): parsed
        // from the same t.scenario string, not a separate stored shape --
        // so a topic saved before this existed still opens correctly here.
        const sr = _parseSrScenario(scenText);
        if ($('topic-sr-situation')) $('topic-sr-situation').value = sr.situation;
        if ($('topic-sr-wrong'))     $('topic-sr-wrong').value     = sr.wrongResponse;
        const ta = _parseTaScenario(scenText);
        if ($('topic-ta-background')) $('topic-ta-background').value = ta.background;
        _renderTaTurnsEditor(ta.turns);
        const fb = _parseFbScenario(scenText);
        if ($('topic-fb-situation')) $('topic-fb-situation').value = fb.situation;
        _renderThinkAboutEditor(fb.thinkAbout);
        _updateTopicModalFieldsForModule(module);
      }
    } else {
      if (titleEl) titleEl.textContent = 'New Topic';
      const initialModule = _topicsFilter || 'pick-speak';
      if (modSelect) modSelect.value = initialModule;
      if (inputTitle) inputTitle.value = '';
      if (inputDesc) inputDesc.value = '';
      if (inputScen) inputScen.value = '';
      _renderChecklistEditor([]);
      _renderBotScriptEditor([]);
      if ($('topic-sr-situation')) $('topic-sr-situation').value = '';
      if ($('topic-sr-wrong'))     $('topic-sr-wrong').value = '';
      if ($('topic-ta-background')) $('topic-ta-background').value = '';
      _renderTaTurnsEditor([]);
      if ($('topic-fb-situation')) $('topic-fb-situation').value = '';
      _renderThinkAboutEditor([]);
      if ($('topic-internal-data')) $('topic-internal-data').value = '';
      if ($('topic-demo-flag')) $('topic-demo-flag').checked = false;
      _updateTopicModalFieldsForModule(initialModule);
    }

    modal.classList.remove('hidden');
  }

  async function saveTopic() {
    const modSelect = $('topic-module');
    const inputTitle = $('topic-title');
    const inputDesc = $('topic-description');
    const inputScen = $('topic-scenario');

    const module = modSelect ? modSelect.value : 'pick-speak';
    const baseModule = _baseMod(module);
    let title = inputTitle ? inputTitle.value.trim() : '';
    // Trainer demo flag: marked by a "[DEMO]" title prefix (no spare topics
    // column to hold a flag). Checked -> ensure the prefix; unchecked ->
    // strip it, so the checkbox and the title can never disagree.
    if (_isDemoCapable(module) && typeof mgrIsDemoTitle === 'function') {
      const wantDemo = !!($('topic-demo-flag') && $('topic-demo-flag').checked);
      const stripped = title.replace(/^\s*\[demo\]\s*/i, '');
      title = wantDemo ? `${MGR_DEMO_PREFIX} ${stripped}` : stripped;
    }
    const description = inputDesc ? inputDesc.value.trim() : '';
    // Reassemble the segregated fields back into the one scenario string
    // the live app's own parsers expect, for the 3 modules that get a
    // structured editor; every other module just uses the plain textarea.
    let scenario;
    if (baseModule === 'mgr-situation-room') {
      scenario = _buildSrScenario($('topic-sr-situation') ? $('topic-sr-situation').value : '', $('topic-sr-wrong') ? $('topic-sr-wrong').value : '');
    } else if (baseModule === 'mgr-transcript-autopsy') {
      scenario = _buildTaScenario($('topic-ta-background') ? $('topic-ta-background').value : '', _getTaTurnValues());
    } else if (baseModule === 'mgr-feedback') {
      scenario = _buildFbScenario($('topic-fb-situation') ? $('topic-fb-situation').value : '', _getThinkAboutValues());
    } else {
      scenario = inputScen ? inputScen.value.trim() : '';
    }
    // Re-attach the Internal Data section after the marker (Situation Room,
    // Transcript Autopsy and Paper Trade only).
    if (INTERNAL_DATA_MODULES.has(baseModule) && typeof mgrJoinInternalData === 'function') {
      scenario = mgrJoinInternalData(scenario, $('topic-internal-data') ? $('topic-internal-data').value : '');
    }
    const isMcq = MCQ_SHAPED_MODULES.has(module);

    if (!title) {
      alert('Please enter a topic title.');
      return;
    }

    try {
      // This used to always write a brand-new object with no checklist/
      // bot_script/enabled at all, which meant editing ANY existing topic
      // through this modal silently wiped its checklist and bot-script
      // content. Now: fetch what's already there (if editing) so an
      // MCQ-shaped module's checklist (a different data shape, not edited
      // here) and the enabled/created_at flags are preserved either way.
      const existing = _editTopicId ? await DB.get('topics', _editTopicId) : null;

      const topic = {
        // A NEW topic sends no id at all: Supabase's topics.id is a uuid
        // column that generates its own, and the old made-up
        // 'topic_<timestamp>' id was rejected ("invalid input syntax for
        // type uuid"), so + New Topic failed for every module. Editing
        // still sends the real id; the local-storage fallback also
        // generates one when it's missing.
        ...(_editTopicId ? { id: _editTopicId } : {}),
        module,
        title,
        description,
        scenario,
        checklist: isMcq ? (existing ? existing.checklist : []) : _getChecklistValues(),
        botScript: isMcq ? (existing ? (existing.botScript || existing.bot_script) : []) : _getBotScriptValues(),
        enabled: existing ? (existing.enabled !== false) : true,
        created_at: existing ? existing.created_at : new Date().toISOString()
      };

      await DB.put('topics', topic);
      closeTopicModal();
      toast(_editTopicId ? 'Topic updated!' : 'Topic created!', 'success');
      renderTopicsList();
    } catch (e) {
      alert('Failed to save topic: ' + e.message);
    }
  }

  async function deleteTopic(topicId) {
    if (!confirm('Are you sure you want to delete this topic?')) return;
    try {
      await DB.del('topics', topicId);
      toast('Topic deleted.', '');
      renderTopicsList();
    } catch (e) {
      alert('Failed to delete topic: ' + e.message);
    }
  }

  async function toggleTopicEnabled(topicId) {
    try {
      const t = await DB.get('topics', topicId);
      if (t) {
        t.enabled = !(t.enabled !== false);
        await DB.put('topics', t);
        renderTopicsList();
      }
    } catch (e) {
      console.error('toggleTopicEnabled failed:', e);
    }
  }

  async function enableAllTopics() {
    if (!_topicsFilter) { toast('Pick a module first.', 'error'); return; }
    try {
      const allTopics = await DB.getAll('topics');
      const filtered = allTopics.filter(t => matchesModuleFilter(t.module, _topicsFilter));
      for (const t of filtered) {
        t.enabled = true;
        await DB.put('topics', t);
      }
      toast('All topics enabled for current tab.', 'success');
      renderTopicsList();
    } catch (e) {
      console.error('enableAllTopics failed:', e);
    }
  }

  async function disableAllTopics() {
    if (!_topicsFilter) { toast('Pick a module first.', 'error'); return; }
    try {
      const allTopics = await DB.getAll('topics');
      const filtered = allTopics.filter(t => matchesModuleFilter(t.module, _topicsFilter));
      for (const t of filtered) {
        t.enabled = false;
        await DB.put('topics', t);
      }
      toast('All topics disabled for current tab.', 'info');
      renderTopicsList();
    } catch (e) {
      console.error('disableAllTopics failed:', e);
    }
  }

  function applyAssessmentFilters(sessions, topicMap) {
    // First split by archive status (stored in settings, not a DB column)
    let filtered = _viewArchive
      ? sessions.filter(s => _archivedIds.has(s.id))
      : sessions.filter(s => !_archivedIds.has(s.id));

    filtered = filtered.filter(s => matchesModuleFilter(s.module, _assessmentsFilter.module));
    if (_assessmentsFilter.status !== 'all') {
      filtered = filtered.filter(s => s.status === _assessmentsFilter.status);
    }
    if (_assessmentsFilter.team !== 'all') {
      filtered = filtered.filter(s => _teamAssignments[s.traineeId] === _assessmentsFilter.team);
    }

    if (_currentManagerDrill) {
      _restoreIndividualSessionsHeader();
      const drill = _currentManagerDrill;
      // Resolve each session's manager using team-assignment (primary) or baked index (fallback)
      const resolveSessionMgr = s => {
        const assigned = _teamAssignments[s.traineeId];
        return (assigned && _MANAGER_AGENT_MAP[assigned]) ? assigned : _getAgentManager(s.traineeName);
      };
      if (drill === '(No Manager Assigned)') {
        filtered = filtered.filter(s => !resolveSessionMgr(s));
      } else {
        filtered = filtered.filter(s => resolveSessionMgr(s) === drill);
      }
      renderAssessmentsTable(filtered, topicMap);
    } else {
      // Default: manager summary view
      renderManagerSummaryTable(filtered, topicMap);
    }
  }

  // ---- Restore thead to individual-session columns ----
  function _restoreIndividualSessionsHeader() {
    const theadTr = $('assessments-thead-tr');
    if (!theadTr) return;
    theadTr.innerHTML = `
      <th style="width:36px;text-align:center">
        <input type="checkbox" id="select-all-sessions" onchange="Admin.toggleAllSessions(this.checked)" />
      </th>
      <th>Trainee</th>
      <th>Module</th>
      <th>Topic</th>
      <th>Submitted</th>
      <th>Status</th>
      <th>AI Score</th>
      <th>Admin Score</th>
      <th>Final Score</th>
      <th>Actions</th>`;
  }

  // ---- Manager summary table (default assessments view) ----
  function renderManagerSummaryTable(sessions, topicMap) {
    const theadTr = $('assessments-thead-tr');
    const tbody   = $('assessments-tbody');

    // Switch to manager-summary columns
    if (theadTr) {
      theadTr.innerHTML = `
        <th style="width:36px;text-align:center"><input type="checkbox" id="select-all-managers" onchange="Admin.toggleAllManagers(this.checked)" /></th>
        <th>Manager</th>
        <th style="text-align:center">Agents (with sessions / total)</th>
        <th style="text-align:center">Sessions</th>
        <th style="text-align:right">Avg AI Score</th>
        <th style="text-align:right">Avg Admin Score</th>
        <th>Actions</th>`;
    }

    _allRenderedSessions = sessions;
    // Download All Recordings / Export Excel both read _currentFilteredSessions
    // (see downloadAllRecordings/exportAssessmentsExcel below), which used to
    // only ever get set by renderAssessmentsTable() after drilling into one
    // manager -- so from this default manager-summary view (what's shown on
    // first opening Assessments) it stayed empty/stale and both actions
    // always reported "nothing in the current view" even with sessions
    // clearly visible on screen. Keep it in sync with whatever's actually
    // filtered-in here too.
    _currentFilteredSessions = sessions;
    _selectedSessionIds.clear();
    _selectedManagerNames.clear();
    _updateManagerActionBtns();
    // hide session-level bulk buttons when in manager summary
    const archBtn = $('btn-archive-selected');
    const restBtn = $('btn-restore-selected');
    if (archBtn) archBtn.style.display = 'none';
    if (restBtn) restBtn.style.display = 'none';

    if (!sessions.length) {
      tbody.innerHTML = `<tr><td colspan="7" class="empty-state">${_viewArchive ? 'No archived assessments.' : 'No assessments found.'}</td></tr>`;
      return;
    }

    // Group sessions by manager
    // Primary: team assignment stored in settings (traineeId → managerName)
    // Fallback: name-based lookup from _MANAGER_AGENT_MAP
    const managerGroups = {};
    const unassigned    = [];
    sessions.forEach(s => {
      const assigned = _teamAssignments[s.traineeId];
      // Use team assignment if it's a known manager, else name-match (with alias resolution)
      const mgr = (assigned && _MANAGER_AGENT_MAP[assigned])
                ? assigned
                : _getAgentManager(s.traineeName);
      if (mgr) {
        if (!managerGroups[mgr]) managerGroups[mgr] = [];
        managerGroups[mgr].push(s);
      } else {
        unassigned.push(s);
      }
    });

    const makeRow = (mgr, mgrSessions, isUnassigned) => {
      const totalAgents        = isUnassigned ? '?' : ((_MANAGER_AGENT_MAP[mgr] || []).length);
      const agentsWithSessions = new Set(mgrSessions.map(s => (s.traineeName || '').trim().toLowerCase())).size;
      const agentsLabel        = isUnassigned ? agentsWithSessions : `${agentsWithSessions} / ${totalAgents}`;

      const aiNums    = mgrSessions.map(s => s.aiScores    ? normalizeOverall(s.aiScores.overall) : null).filter(x => x !== null);
      const adminNums = mgrSessions.map(s => s.adminScores ? calcAdminAvg(s.adminScores)           : null).filter(x => x !== null);
      const avgAI    = aiNums.length    ? (aiNums.reduce((a, b) => a + b, 0)    / aiNums.length).toFixed(1)    : '—';
      const avgAdmin = adminNums.length ? (adminNums.reduce((a, b) => a + b, 0) / adminNums.length).toFixed(1) : '—';

      const safeMgr    = mgr.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      const archiveBtn = _viewArchive
        ? `<button class="btn-small" onclick="event.stopPropagation();Admin.restoreAllManagerSessions('${safeMgr}')">↩ Restore All</button>`
        : `<button class="btn-small" onclick="event.stopPropagation();Admin.archiveAllManagerSessions('${safeMgr}')">📁 Archive All</button>`;

      return `<tr style="cursor:pointer" onclick="Admin.drillIntoManager('${safeMgr}')">
        <td style="text-align:center" onclick="event.stopPropagation()">
          ${!isUnassigned ? `<input type="checkbox" class="manager-cb" data-mgr="${mgr.replace(/"/g,'&quot;')}" onchange="Admin.toggleManagerCheckbox('${safeMgr}', this.checked)" />` : ''}
        </td>
        <td><strong style="color:var(--primary)">${mgr}</strong></td>
        <td style="text-align:center">${agentsLabel}</td>
        <td style="text-align:center;font-weight:600">${mgrSessions.length}</td>
        <td style="text-align:right">${avgAI !== '—' ? avgAI + '/100' : '—'}</td>
        <td style="text-align:right;font-weight:600;color:${avgAdmin !== '—' ? '#1d4ed8' : 'var(--text-muted)'}">${avgAdmin !== '—' ? avgAdmin + '/100' : '—'}</td>
        <td style="display:flex;gap:0.4rem;flex-wrap:wrap">
          <button class="btn-small primary" onclick="event.stopPropagation();Admin.drillIntoManager('${safeMgr}')">View Sessions</button>
          ${!isUnassigned ? archiveBtn : ''}
        </td>
      </tr>`;
    };

    const rows = Object.entries(managerGroups)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([mgr, mgrSessions]) => makeRow(mgr, mgrSessions, false))
      .join('');

    const unassignedRow = unassigned.length ? makeRow('(No Manager Assigned)', unassigned, true) : '';

    tbody.innerHTML = rows + unassignedRow;
  }

  // ---- Drill into a specific manager's sessions ----
  function drillIntoManager(managerName) {
    _currentManagerDrill = managerName;
    const backBtn = $('btn-back-to-managers');
    if (backBtn) {
      backBtn.style.display = '';
      backBtn.querySelector('button').textContent = `← Back to Managers  (${managerName})`;
    }
    const mgrSel = $('filter-manager');
    if (mgrSel) mgrSel.value = managerName;
    applyAssessmentFilters(_cachedSessions, _cachedTopicMap);
  }

  function backToManagers() {
    _currentManagerDrill = null;
    const backBtn = $('btn-back-to-managers');
    if (backBtn) backBtn.style.display = 'none';
    const mgrSel = $('filter-manager');
    if (mgrSel) mgrSel.value = '';
    applyAssessmentFilters(_cachedSessions, _cachedTopicMap);
  }

  // ---- Archive / Restore all sessions for a manager ----
  // Resolve which manager a session belongs to — same logic used by renderManagerSummaryTable
  function _resolveSessionManager(s) {
    const assigned = _teamAssignments[s.traineeId];
    return (assigned && _MANAGER_AGENT_MAP[assigned]) ? assigned : _getAgentManager(s.traineeName);
  }

  async function archiveAllManagerSessions(managerName) {
    const ids = _cachedSessions
      .filter(s => _resolveSessionManager(s) === managerName)
      .filter(s => !_archivedIds.has(s.id))
      .map(s => s.id);
    if (!ids.length) { toast('No active sessions to archive for this manager.', ''); return; }
    if (!confirm(`Archive all ${ids.length} active session${ids.length !== 1 ? 's' : ''} for ${managerName}?\n\nYou can restore them at any time from the Archive tab.`)) return;
    try {
      await _setSessionsArchived(ids, true);
      toast(`Archived ${ids.length} session${ids.length !== 1 ? 's' : ''} for ${managerName}.`, 'success');
    } catch (e) {
      toast('Archive failed: ' + e.message, 'error');
    }
  }

  async function restoreAllManagerSessions(managerName) {
    const ids = _cachedSessions
      .filter(s => _resolveSessionManager(s) === managerName)
      .filter(s => _archivedIds.has(s.id))
      .map(s => s.id);
    if (!ids.length) { toast('No archived sessions to restore for this manager.', ''); return; }
    if (!confirm(`Restore all ${ids.length} archived session${ids.length !== 1 ? 's' : ''} for ${managerName}?`)) return;
    try {
      await _setSessionsArchived(ids, false);
      toast(`Restored ${ids.length} session${ids.length !== 1 ? 's' : ''} for ${managerName}.`, 'success');
    } catch (e) {
      toast('Restore failed: ' + e.message, 'error');
    }
  }

  // ---- Manager checkbox multi-select ----
  function toggleManagerCheckbox(mgrName, checked) {
    if (checked) _selectedManagerNames.add(mgrName);
    else         _selectedManagerNames.delete(mgrName);
    _updateManagerActionBtns();
    const allCb = $('select-all-managers');
    if (allCb) {
      const allCbs = document.querySelectorAll('.manager-cb');
      const n = _selectedManagerNames.size;
      allCb.indeterminate = n > 0 && n < allCbs.length;
      allCb.checked       = allCbs.length > 0 && n === allCbs.length;
    }
  }

  function toggleAllManagers(checked) {
    _selectedManagerNames.clear();
    document.querySelectorAll('.manager-cb').forEach(cb => {
      cb.checked = checked;
      if (checked) _selectedManagerNames.add(cb.dataset.mgr);
    });
    _updateManagerActionBtns();
  }

  function _updateManagerActionBtns() {
    const archBtn = $('btn-archive-selected-managers');
    const restBtn = $('btn-restore-selected-managers');
    if (!archBtn || !restBtn) return;
    const n = _selectedManagerNames.size;
    if (_viewArchive) {
      archBtn.style.display = 'none';
      restBtn.style.display = '';
      restBtn.disabled      = n === 0;
      restBtn.textContent   = n > 0 ? `↩ Restore Selected (${n})` : '↩ Restore Selected';
    } else {
      restBtn.style.display = 'none';
      archBtn.style.display = '';
      archBtn.disabled      = n === 0;
      archBtn.textContent   = n > 0 ? `📁 Archive Selected (${n})` : '📁 Archive Selected';
    }
  }

  async function archiveSelectedManagers() {
    const managers = [..._selectedManagerNames];
    if (!managers.length) return;
    const ids = _cachedSessions
      .filter(s => managers.includes(_resolveSessionManager(s)))
      .filter(s => !_archivedIds.has(s.id))
      .map(s => s.id);
    if (!ids.length) { toast('No active sessions found for selected managers.', ''); return; }
    if (!confirm(`Archive all ${ids.length} active session${ids.length !== 1 ? 's' : ''} for ${managers.length} selected manager${managers.length !== 1 ? 's' : ''}?\n\nYou can restore them at any time from the Archive tab.`)) return;
    try {
      await _setSessionsArchived(ids, true);
      _selectedManagerNames.clear();
      toast(`Archived ${ids.length} session${ids.length !== 1 ? 's' : ''}.`, 'success');
    } catch (e) {
      toast('Archive failed: ' + e.message, 'error');
    }
  }

  async function restoreSelectedManagers() {
    const managers = [..._selectedManagerNames];
    if (!managers.length) return;
    const ids = _cachedSessions
      .filter(s => managers.includes(_resolveSessionManager(s)))
      .filter(s => _archivedIds.has(s.id))
      .map(s => s.id);
    if (!ids.length) { toast('No archived sessions found for selected managers.', ''); return; }
    if (!confirm(`Restore all ${ids.length} archived session${ids.length !== 1 ? 's' : ''} for ${managers.length} selected manager${managers.length !== 1 ? 's' : ''}?`)) return;
    try {
      await _setSessionsArchived(ids, false);
      _selectedManagerNames.clear();
      toast(`Restored ${ids.length} session${ids.length !== 1 ? 's' : ''}.`, 'success');
    } catch (e) {
      toast('Restore failed: ' + e.message, 'error');
    }
  }

  // ============================================================
  // Assessments tab — Export Excel / Download recordings
  // ------------------------------------------------------------
  // These three were called from admin.html (per-row "⬇ Recording",
  // "⬇ Export Excel", "⬇ Download All Recordings") but had no implementation
  // anywhere in this file — removed as dead exports back on 2026-09-12
  // (commit f5a3d64) because referencing them crashed admin.js on load, with
  // a note to "rebuild separately if wanted". Implemented now.
  // ============================================================

  // Per-row recording download. Supabase Storage's public bucket URLs allow
  // direct <audio> playback (already used above), but a plain <a href>
  // click on a cross-origin URL usually opens/streams it in the browser
  // instead of downloading — fetching it as a blob first and downloading
  // that forces an actual file save with the right filename. Falls back to
  // opening the URL in a new tab if the fetch is blocked for any reason
  // (e.g. a bucket CORS policy that allows media playback but not fetch).
  async function downloadRecording(url, filename) {
    if (!url) { toast('No recording available for this session.', 'error'); return; }
    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const blob = await resp.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objUrl;
      a.download = filename || 'recording';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(objUrl), 4000);
    } catch (e) {
      console.warn('downloadRecording: fetch failed, opening directly instead:', e.message);
      window.open(url, '_blank');
      toast('Could not auto-download that recording — opened it in a new tab instead; use your browser\'s save option there.', '');
    }
  }

  // Bulk download: zips every recording in the currently-filtered/rendered
  // Assessments table view (respects whatever module/date/archive filters
  // are active, since it reads _currentFilteredSessions rather than all
  // sessions ever recorded).
  async function downloadAllRecordings() {
    const sessions = (_currentFilteredSessions || []).filter(s => s.recordingUrl);
    if (!sessions.length) { toast('No recordings in the current view to download.', 'error'); return; }
    if (typeof JSZip === 'undefined') { toast('ZIP library not loaded — try refreshing the page.', 'error'); return; }

    toast(`Zipping ${sessions.length} recording(s)... this may take a moment.`, '');
    const zip = new JSZip();
    let ok = 0, failed = 0;
    for (const s of sessions) {
      try {
        const resp = await fetch(s.recordingUrl);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const blob = await resp.blob();
        const ext = s.recordingUrl.includes('.mp4') ? 'mp4' : s.recordingUrl.includes('.ogg') ? 'ogg' : 'webm';
        const safeName = (s.traineeName || 'unknown').replace(/[^\w\- ]/g, '').trim().replace(/\s+/g, '_') || 'unknown';
        const dateStr = (s.submittedAt || '').slice(0, 10);
        let filename = `${safeName}-${s.module || 'session'}-${dateStr}.${ext}`;
        // Guard against two sessions producing the same filename (same
        // trainee/module/date) — JSZip would silently let the second
        // overwrite the first otherwise.
        if (zip.file(filename)) filename = `${safeName}-${s.module || 'session'}-${dateStr}-${s.id.slice(0, 6)}.${ext}`;
        zip.file(filename, blob);
        ok++;
      } catch (e) {
        console.warn('Recording download failed for session', s.id, e.message);
        failed++;
      }
    }
    if (ok === 0) { toast('Could not download any recordings — check your connection and try again.', 'error'); return; }

    const content = await zip.generateAsync({ type: 'blob' });
    const objUrl = URL.createObjectURL(content);
    const a = document.createElement('a');
    a.href = objUrl;
    a.download = `recordings_${new Date().toISOString().slice(0, 10)}.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(objUrl), 4000);
    toast(`Downloaded ${ok} recording(s)${failed ? ` (${failed} could not be fetched)` : ''} as a ZIP.`, failed ? '' : 'success');
  }

  // Top-of-tab "Export Excel" — exports whatever's currently in the
  // Assessments table (respects the active module/date/archive filters,
  // same _currentFilteredSessions source as Download All Recordings above).
  function exportAssessmentsExcel() {
    const sessions = _currentFilteredSessions || [];
    if (!sessions.length) { toast('No assessments in the current view to export.', 'error'); return; }
    if (typeof XLSX === 'undefined') { toast('Excel library not loaded — try refreshing the page.', 'error'); return; }

    const rows = sessions.map(s => {
      const aiScore    = s.aiScores    ? normalizeOverall(s.aiScores.overall) : null;
      const adminScore = s.adminScores ? calcAdminAvg(s.adminScores)          : null;
      return {
        'Trainee':       s.traineeName || '',
        'Module':        s.module || '',
        'Topic':         s.topicTitle || '',
        'Date':          formatDate(s.submittedAt).split(' ')[0],
        'Status':        s.adminScores ? 'Scored' : (s.status || ''),
        'AI Score':      aiScore    != null ? aiScore    : '',
        'Admin Score':   adminScore != null ? adminScore : '',
        'Admin Comment': s.adminComment || '',
        'Has Recording': s.recordingUrl ? 'Yes' : 'No',
      };
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{ wch: 20 }, { wch: 18 }, { wch: 30 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 40 }, { wch: 12 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Assessments');
    const filename = `assessments_${_viewArchive ? 'archive_' : ''}${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, filename);
    toast(`Exported ${rows.length} assessment(s) to ${filename}`, 'success');
  }

  function renderAssessmentsTable(sessions, topicMap) {
    const tbody = $('assessments-tbody');
    const sorted = [...sessions].sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
    _currentFilteredSessions = sorted; // track for Download All
    _allRenderedSessions = sorted;     // track for select-all
    _selectedSessionIds.clear();
    _selectedManagerNames.clear();
    _updateSessionActionBtns();
    // hide manager-level bulk buttons when in session drill view
    const mgrArchBtn = $('btn-archive-selected-managers');
    const mgrRestBtn = $('btn-restore-selected-managers');
    if (mgrArchBtn) mgrArchBtn.style.display = 'none';
    if (mgrRestBtn) mgrRestBtn.style.display = 'none';

    // Reset select-all checkbox
    const allCb = $('select-all-sessions');
    if (allCb) { allCb.checked = false; allCb.indeterminate = false; }

    if (sorted.length === 0) {
      tbody.innerHTML = `<tr><td colspan="10" class="empty-state">${_viewArchive ? 'No archived assessments.' : 'No assessments found.'}</td></tr>`;
      return;
    }

    // ── Pick & Speak: pre-compute per-trainee.
    // Effective score per session = admin score if scored, else AI score.
    // avgOfAll  = average of effective scores across ALL that trainee's P&S sessions.
    // bestId    = session with the highest effective score (that row shows avgOfAll; rest → N/A).
    const PS_MODULES = new Set(['pick-speak', 'pick-speak-general', 'pick-speak-stock']);
    const psGrouped  = {}; // traineeId → [{ id, eff }]
    sorted.forEach(s => {
      if (!PS_MODULES.has(s.module)) return;
      const adminNum = s.adminScores ? (calcAdminAvg(s.adminScores)          ?? null) : null;
      const aiNum    = s.aiScores    ? (normalizeOverall(s.aiScores.overall) ?? null) : null;
      const eff      = adminNum !== null ? adminNum : aiNum; // prefer admin
      if (eff === null) return;
      if (!psGrouped[s.traineeId]) psGrouped[s.traineeId] = [];
      psGrouped[s.traineeId].push({ id: s.id, eff });
    });
    const psByTrainee = {}; // traineeId → { bestId, avgOfAll }
    Object.entries(psGrouped).forEach(([tid, list]) => {
      const best     = list.reduce((a, b) => b.eff > a.eff ? b : a);
      const avgOfAll = parseFloat((list.reduce((s, x) => s + x.eff, 0) / list.length).toFixed(1));
      psByTrainee[tid] = { bestId: best.id, avgOfAll };
    });

    tbody.innerHTML = sorted.map(s => {
      const aiScore    = s.aiScores    ? (normalizeOverall(s.aiScores.overall) ?? '—') : '—';
      const adminScore = s.adminScores ? (calcAdminAvg(s.adminScores)          ?? '—') : '—';
      const isScored   = !!s.adminScores;

      // For P&S: best-session row shows average of all sessions' effective scores; others → N/A
      // For all other modules (mock call, grammar, listening): admin score is final;
      //   if no admin score, AI score is final. No averaging.
      let avgScore;
      if (PS_MODULES.has(s.module)) {
        const info = psByTrainee[s.traineeId];
        avgScore = (info && s.id === info.bestId) ? info.avgOfAll : 'N/A';
      } else {
        const aiNum    = aiScore    !== '—' ? parseFloat(aiScore)    : null;
        const adminNum = adminScore !== '—' ? parseFloat(adminScore) : null;
        avgScore = adminNum !== null ? adminNum : (aiNum !== null ? aiNum : '—');
      }
      const ext = (s.recordingUrl || '').includes('.mp4') ? 'mp4' : (s.recordingUrl || '').includes('.ogg') ? 'ogg' : 'webm';
      const dlFilename = `${(s.traineeName || 'recording').replace(/\s+/g, '_')}-${s.module}-${(s.submittedAt || '').slice(0, 10)}.${ext}`;
      const dlBtn = s.recordingUrl
        ? `<button class="btn-small" onclick="Admin.downloadRecording('${s.recordingUrl}', '${dlFilename}')">⬇ Recording</button>`
        : '';

      const archiveBtn = _viewArchive
        ? `<button class="btn-small" onclick="Admin.restoreSingleSession('${s.id}', '${(s.traineeName || '').replace(/'/g, "\\'")}')">↩ Restore</button>`
        : `<button class="btn-small" onclick="Admin.archiveSingleSession('${s.id}', '${(s.traineeName || '').replace(/'/g, "\\'")}')">📁 Archive</button>`;

      return `
        <tr class="${_archivedIds.has(s.id) ? 'session-archived' : ''}">
          <td style="width:36px;text-align:center">
            <input type="checkbox" class="session-cb" data-id="${s.id}"
              onchange="Admin.toggleSessionCheckbox('${s.id}', this.checked)" />
          </td>
          <td><strong>${s.traineeName || '—'}</strong></td>
          <td>${moduleBadge(s.module)}</td>
          <td style="max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${s.topicTitle || '—'}</td>
          <td style="white-space:nowrap">${formatDate(s.submittedAt).split(' ')[0]}</td>
          <td>${statusBadge(isScored ? 'scored' : s.status)}</td>
          <td>${aiScore    !== '—' ? aiScore    + '/100' : '—'}</td>
          <td>${adminScore !== '—' ? adminScore + '/100' : '—'}</td>
          <td style="font-weight:600;color:${avgScore === 'N/A' || avgScore === '—' ? 'var(--text-muted)' : '#1d4ed8'}">${avgScore !== '—' && avgScore !== 'N/A' ? avgScore + '/100' : avgScore}</td>
          <td style="display:flex;gap:0.4rem;flex-wrap:wrap">
            <button class="btn-small primary" onclick="Admin.openScoring('${s.id}')">
              ${isScored ? 'Review' : 'Score'}
            </button>
            ${dlBtn}
            ${archiveBtn}
            <button class="btn-small danger" onclick="Admin.deleteSession('${s.id}', '${(s.traineeName || '').replace(/'/g, "\\'")}')">
              🗑 Delete
            </button>
          </td>
        </tr>`;
    }).join('');
  }

  // ============================================================
  // Session Scoring Modal (Assessments tab → "Score" / "Review")
  // ------------------------------------------------------------
  // The #scoring-modal markup (playback + criteria sliders + comment box)
  // has existed in admin.html for a long time, but nothing in this file ever
  // wired it up: the "Score"/"Review" button called Admin.openScoring(),
  // which was never defined — so clicking it silently did nothing for every
  // module (Mock Call, Ops Escalation Call, Written Comm, Pick & Speak, all
  // of it), not just Ops Escalation. Implemented here so admin can actually
  // listen to a session's recording and score it per-criterion — needed for
  // Ops Escalation Call's parameters, but this fixes manual scoring for
  // every module at once. (_scoringSessionId itself was already declared
  // with the rest of the module state near the top of this file — also
  // scaffolded ahead of time and never used until now.)

  function _escScoring(t) {
    return (t == null ? '' : String(t)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function openScoring(sessionId) {
    const session = _cachedSessions.find(s => s.id === sessionId);
    if (!session) { toast('Session not found.', 'error'); return; }
    _scoringSessionId = sessionId;

    const modal = $('scoring-modal');
    if (!modal) return;

    const module    = session.module;
    const isWritten = module === 'written-comm' || module === 'ops-writing-assessment';
    const isMcq     = module === 'grammar-assessment' || module === 'listening-assessment';
    const isAudio   = !isWritten && !isMcq;

    const traineeEl = $('scoring-trainee');
    const badgeEl   = $('scoring-module-badge');
    const topicEl   = $('scoring-topic');
    const dateEl    = $('scoring-date');
    if (traineeEl) traineeEl.textContent = session.traineeName || '—';
    if (badgeEl) {
      badgeEl.className   = `module-badge ${MODULE_BADGE_CLASS[module] || ''}`;
      badgeEl.textContent = MODULE_LABELS[module] || module;
    }
    if (topicEl)   topicEl.textContent   = session.topicTitle || '—';
    if (dateEl)    dateEl.textContent    = 'Submitted ' + formatDate(session.submittedAt);

    // Left panel: audio / written / MCQ + transcript
    const audioSection      = $('scoring-audio-section');
    const writtenSection    = $('scoring-written-section');
    const mcqSection        = $('scoring-mcq-section');
    const transcriptSection = $('scoring-transcript-section');
    const audioEl           = $('scoring-audio');

    if (audioSection) audioSection.classList.toggle('hidden', !isAudio);
    if (audioEl) {
      if (isAudio && session.recordingUrl) audioEl.src = session.recordingUrl;
      else audioEl.removeAttribute('src');
    }

    if (writtenSection) {
      writtenSection.classList.toggle('hidden', !isWritten);
      if (isWritten) {
        const txt = $('scoring-written-text');
        if (txt) txt.innerHTML = _escScoring(session.writtenText || session.transcript || '(no text)').replace(/\n/g, '<br>');
      }
    }

    if (mcqSection) {
      mcqSection.classList.toggle('hidden', !isMcq);
      if (isMcq) {
        const ai = session.aiScores || {};
        const scoreEl = $('scoring-mcq-score');
        if (scoreEl) scoreEl.textContent = `${ai.correct ?? 0}/${ai.total ?? '—'} correct — ${ai.overall ?? 0}%`;
        const reviewEl = $('scoring-mcq-review');
        if (reviewEl) reviewEl.innerHTML = '';
      }
    }

    if (transcriptSection) {
      transcriptSection.classList.toggle('hidden', isWritten || isMcq);
      if (!isWritten && !isMcq) {
        const tEl = $('scoring-transcript');
        if (tEl) tEl.innerHTML = _escScoring(session.transcript || '(no transcript)').replace(/\n/g, '<br>');
      }
    }

    // AI band card
    const ai = session.aiScores || {};
    const bandEl = $('scoring-ai-band');
    if (bandEl) {
      if (ai.overall != null) {
        const overallPct = normalizeOverall(ai.overall);
        const band = getBand(module, overallPct);
        bandEl.innerHTML = band ? `
          <div class="band-card ${band.cls}">
            <div class="band-header">
              <span class="band-icon">${band.icon}</span>
              <div class="band-info">
                <div class="band-label">${band.label}</div>
                <div class="band-score">${overallPct}/100 (AI)</div>
              </div>
            </div>
            <div class="band-feedback">${band.feedback}</div>
          </div>` : '';
      } else {
        bandEl.innerHTML = '';
      }
    }

    // AI per-criterion scores (reference only, shown on the left)
    const criteria = SCORING_CRITERIA[module] || [];
    const aiScoresEl = $('scoring-ai-scores-display');
    if (aiScoresEl) {
      let html = criteria.map(c => {
        const val = ai[c.key];
        if (val == null) return '';
        const pct    = ((val / 5) * 100).toFixed(0);
        const stars  = '★'.repeat(Math.round(val)) + '☆'.repeat(5 - Math.round(val));
        const reason = (ai._reasons && ai._reasons[c.key]) ? `<div class="score-reason">${_escScoring(ai._reasons[c.key])}</div>` : '';
        return `<div class="ai-score-row"><span class="score-label">${c.label}</span><div class="score-bar"><div class="score-bar-fill" style="width:${pct}%"></div></div><span class="score-stars">${stars}</span><span class="score-val">${val}/5</span></div>${reason}`;
      }).join('');
      if (ai.overall != null) {
        const overallPct = normalizeOverall(ai.overall);
        html += `<div class="ai-score-row" style="background:#eff6ff;border:1px solid #dbeafe"><span class="score-label" style="font-weight:800">Overall AI Score</span><div class="score-bar"><div class="score-bar-fill" style="width:${overallPct}%;background:#3b82f6"></div></div><span class="score-val" style="color:#3b82f6;font-weight:700">${overallPct}/100</span></div>`;
      }
      aiScoresEl.innerHTML = html;
    }

    // Right panel: admin scoring inputs
    _renderScoringCriteria(session, criteria);

    const commentEl = $('scoring-comment');
    if (commentEl) commentEl.value = session.adminComment || '';

    modal.classList.remove('hidden');
  }

  function _renderScoringCriteria(session, criteria) {
    const criteriaEl = $('scoring-criteria');
    if (!criteriaEl) return;

    if (!criteria.length) {
      criteriaEl.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem">This module is auto-scored — there are no manual criteria to set. You can still add a comment below.</p>';
      _updateScoringTotal();
      return;
    }

    const existing = session.adminScores || {};
    const ai       = session.aiScores    || {};
    let lastGroup  = null;
    const rows = [];

    criteria.forEach(c => {
      if (c.group && c.group !== lastGroup) {
        lastGroup = c.group;
        rows.push(`<div class="criterion-group-header">${c.group}</div>`);
      }
      const val  = existing[c.key] != null ? existing[c.key] : (ai[c.key] != null ? ai[c.key] : (c.scale135 ? 3 : 3));
      const desc = c.desc ? `<div class="criterion-desc">${c.desc}</div>` : '';

      if (c.scale135) {
        const opts = [1, 3, 5].map(n => {
          const lbl = n === 1 ? 'Not Met' : n === 3 ? 'Partial' : 'Fully Met';
          return `<label class="scale-135-option ${val === n ? 'selected-' + n : ''}" data-key="${c.key}" data-n="${n}">
            <input type="radio" name="scoring-${c.key}" value="${n}" ${val === n ? 'checked' : ''} />${lbl}
          </label>`;
        }).join('');
        rows.push(`<div class="criterion-row" data-key="${c.key}" data-scale135="1">
          <div class="criterion-label"><span>${c.label}</span></div>
          ${desc}
          <div class="scale-135-group">${opts}</div>
        </div>`);
      } else {
        rows.push(`<div class="criterion-row" data-key="${c.key}">
          <div class="criterion-label"><span>${c.label}</span><span class="criterion-val" data-val-for="${c.key}">${val}</span></div>
          ${desc}
          <input type="range" min="1" max="5" step="0.5" value="${val}" class="criterion-slider" data-key="${c.key}" />
        </div>`);
      }
    });

    criteriaEl.innerHTML = rows.join('');

    criteriaEl.querySelectorAll('.criterion-slider').forEach(sl => {
      sl.addEventListener('input', () => {
        const out = criteriaEl.querySelector(`[data-val-for="${sl.dataset.key}"]`);
        if (out) out.textContent = sl.value;
        _updateScoringTotal();
      });
    });

    criteriaEl.querySelectorAll('.scale-135-option').forEach(opt => {
      opt.addEventListener('click', () => {
        const key = opt.dataset.key;
        criteriaEl.querySelectorAll(`.scale-135-option[data-key="${key}"]`).forEach(o => {
          o.classList.remove('selected-1', 'selected-3', 'selected-5');
        });
        opt.classList.add('selected-' + opt.dataset.n);
        const radio = opt.querySelector('input');
        if (radio) radio.checked = true;
        _updateScoringTotal();
      });
    });

    _updateScoringTotal();
  }

  function _readScoringInputs() {
    const criteriaEl = $('scoring-criteria');
    const scores = {};
    let sum = 0, count = 0;
    if (criteriaEl) {
      criteriaEl.querySelectorAll('.criterion-row').forEach(row => {
        const key = row.dataset.key;
        let val = null;
        if (row.dataset.scale135) {
          const checked = row.querySelector('input[type="radio"]:checked');
          val = checked ? parseFloat(checked.value) : null;
        } else {
          const slider = row.querySelector('.criterion-slider');
          val = slider ? parseFloat(slider.value) : null;
        }
        if (val != null && !isNaN(val)) { scores[key] = val; sum += val; count++; }
      });
    }
    const overall = count > 0 ? parseFloat(((sum / (count * 5)) * 100).toFixed(1)) : null;
    return { scores, overall };
  }

  function _updateScoringTotal() {
    const { overall } = _readScoringInputs();
    const totalEl = $('scoring-total-display');
    if (totalEl) totalEl.textContent = overall != null ? overall : '—';
    const bandInline = $('admin-band-inline');
    if (bandInline) {
      const session = _cachedSessions.find(s => s.id === _scoringSessionId);
      const band = (session && overall != null) ? getBand(session.module, overall) : null;
      bandInline.textContent = band ? `${band.icon} ${band.label}` : '';
    }
  }

  function useAiFeedback() {
    if (!_scoringSessionId) return;
    const session = _cachedSessions.find(s => s.id === _scoringSessionId);
    const commentEl = $('scoring-comment');
    if (!session || !commentEl) return;
    const ai = session.aiScores || {};

    if (ai._summary) {
      const div = document.createElement('div');
      div.innerHTML = ai._summary;
      commentEl.value = (div.textContent || div.innerText || '').trim();
      return;
    }
    if (ai._reasons) {
      const criteria = SCORING_CRITERIA[session.module] || [];
      const lines = criteria
        .map(c => ai._reasons[c.key] ? `${c.label}: ${ai._reasons[c.key]}` : null)
        .filter(Boolean);
      if (lines.length) { commentEl.value = lines.join('\n'); return; }
    }
    toast('No AI feedback available for this session.', '');
  }

  function closeScoring() {
    const modal = $('scoring-modal');
    if (modal) modal.classList.add('hidden');
    _scoringSessionId = null;
  }

  async function saveScoring() {
    if (!_scoringSessionId) return;
    const session = _cachedSessions.find(s => s.id === _scoringSessionId);
    if (!session) return;

    const criteria = SCORING_CRITERIA[session.module] || [];
    let adminScores;
    if (criteria.length) {
      const read = _readScoringInputs();
      adminScores = read.scores;
      adminScores.overall = read.overall;
    } else {
      // Auto-scored modules (grammar/listening): admin "score" mirrors the AI score
      adminScores = Object.assign({}, session.aiScores || {});
    }

    const commentEl = $('scoring-comment');
    const comment = commentEl ? commentEl.value.trim() : '';
    const sessionId = _scoringSessionId;

    try {
      await DB.patch('sessions', sessionId, { adminScores, adminComment: comment, status: 'scored' });
      const idx = _cachedSessions.findIndex(s => s.id === sessionId);
      if (idx >= 0) {
        _cachedSessions[idx].adminScores  = adminScores;
        _cachedSessions[idx].adminComment = comment;
        _cachedSessions[idx].status       = 'scored';
      }
      await updatePendingBadge();
      toast('Score saved and shared with trainee.', 'success');
      closeScoring();
      applyAssessmentFilters(_cachedSessions, _cachedTopicMap);
    } catch (e) {
      toast('Failed to save score: ' + e.message, 'error');
    }
  }

  function initScoringModal() {
    const closeBtn = $('btn-close-scoring');
    if (closeBtn) closeBtn.onclick = closeScoring;
    const saveBtn = $('btn-save-score');
    if (saveBtn) saveBtn.onclick = saveScoring;
    const aiFeedbackBtn = $('btn-use-ai-feedback');
    if (aiFeedbackBtn) aiFeedbackBtn.onclick = useAiFeedback;
    const modal = $('scoring-modal');
    if (modal) {
      modal.addEventListener('click', (e) => { if (e.target === modal) closeScoring(); });
    }
  }

  // ---- Best-effort: snapshot a trainee's current comm360 contribution
  // before their session row is deleted, so the score doesn't silently
  // vanish from Reports/Comm360 unless the admin explicitly chose to also
  // delete it from there (deleteFromReports). This was another call to a
  // function that didn't exist anywhere in the file (see loadAssessments()
  // above for the matching note) — every assessment deletion threw before
  // ever reaching DB.del(), so deleting an assessment has never actually
  // worked. Mirrors the exact scaled fields _buildLiveScoreMap() already
  // reads back from settings.preservedReportScores as a fallback.
  async function _preserveScoresBeforeDeletion(sessions, deleteFromReports) {
    if (deleteFromReports) return; // admin explicitly chose not to preserve
    try {
      const allSessions = await DB.getAll('sessions'); // still includes the row(s) about to be deleted
      const rec = await DB.get('settings', 'preservedReportScores');
      const preserved = rec && rec.value ? JSON.parse(rec.value) : {};
      const r2 = v => Math.round(v * 100) / 100;

      for (const session of sessions) {
        if (!session || !session.traineeId) continue;
        const canonical = _resolveAlias(session.traineeName || '');
        if (!canonical) continue;
        const { scores } = computeAgentScores(session.traineeId, allSessions);
        const entry = preserved[canonical] || {};
        if (scores['pick-speak']           != null) entry.psScore   = r2(scores['pick-speak']           / 100 * 20);
        if (scores['listening-assessment'] != null) entry.lisScore  = r2(scores['listening-assessment']  / 100 * 20);
        if (scores['mock-call']            != null) entry.mcScore   = r2(scores['mock-call']             / 100 * 20);
        if (scores['grammar-assessment']   != null) entry.gramScore = r2(scores['grammar-assessment']    / 100 * 25);
        preserved[canonical] = entry;
      }

      await DB.put('settings', { key: 'preservedReportScores', value: JSON.stringify(preserved) });
    } catch (e) {
      // Best-effort only — never let this block the actual deletion.
      console.warn('_preserveScoresBeforeDeletion failed (deletion will continue):', e);
    }
  }

  // ---- Delete Session ----
  async function deleteSession(sessionId, traineeName) {
    const confirmed = confirm(
      `Delete this assessment?\n\nTrainee: ${traineeName || 'Unknown'}\n\nThis will remove the session details (recording & transcript) but PRESERVE the score in the reports.`
    );
    if (!confirmed) return;

    let deleteFromReports = false;
    const confirmReports = confirm(
      `Do you also want to permanently delete this score from Reports and the Comm360 Master Sheet?\n\n(Warning: This requires separate admin confirmation)`
    );
    if (confirmReports) {
      const pin = prompt("Enter Admin Password to confirm deletion from reports:");
      const pwRec = await DB.get('settings', 'adminPassword');
      const correctPw = pwRec ? pwRec.value : 'admin123';
      if (pin === correctPw) {
        deleteFromReports = true;
      } else {
        alert("Invalid password. The score will be preserved in reports.");
      }
    }

    try {
      const session = await DB.get('sessions', sessionId);
      if (session) {
        await _preserveScoresBeforeDeletion([session], deleteFromReports);
      }
      await DB.del('sessions', sessionId);
      toast('Assessment deleted.', '');
      loadAssessments();
    } catch (e) {
      console.error('Delete failed:', e);
      toast('Failed to delete assessment.', 'error');
    }
  }

  // ---- Delete All (Assessments tab) ----
  // Scoped to whatever is currently shown in the table (respects the
  // Active/Archive tab, manager drill-down, and the filter bar) — same
  // "current view" scoping convention as disableAllTopics/enableAllTopics.
  async function deleteAllSessions() {
    const sessions = _currentFilteredSessions || [];
    if (!sessions.length) { toast('No assessments in the current view to delete.', 'error'); return; }

    const step1 = confirm(
      `Delete all ${sessions.length} assessment(s) currently shown (${_viewArchive ? 'Archive' : 'Active'} view)?\n\nThis will remove session details (recordings & transcripts) but PRESERVE scores in Reports.`
    );
    if (!step1) return;

    let deleteFromReports = false;
    const confirmReports = confirm(
      `Do you also want to permanently delete these scores from Reports and the Comm360 Master Sheet?\n\n(Warning: This requires separate admin confirmation)`
    );
    if (confirmReports) {
      const pin = prompt('Enter Admin Password to confirm deletion from reports:');
      const pwRec = await DB.get('settings', 'adminPassword');
      const correctPw = pwRec ? pwRec.value : 'admin123';
      if (pin === correctPw) {
        deleteFromReports = true;
      } else {
        alert('Invalid password. Scores will be preserved in reports.');
      }
    }

    try {
      await _preserveScoresBeforeDeletion(sessions, deleteFromReports);
      let failed = 0;
      for (const s of sessions) {
        try { await DB.del('sessions', s.id); } catch (e) { console.error('Delete session failed:', s.id, e); failed++; }
      }
      const n = sessions.length;
      toast(failed ? `Deleted ${n - failed} of ${n} assessment(s) — ${failed} failed.` : `Deleted ${n} assessment(s).`, failed ? 'error' : 'success');
      loadAssessments();
    } catch (e) {
      console.error('deleteAllSessions error:', e);
      toast('Failed to delete assessments: ' + e.message, 'error');
      loadAssessments();
    }
  }

  async function forceReSeed() {
    const btn = document.getElementById('btn-force-seed');
    if (btn) {
      btn.disabled = true;
      btn.textContent = '⏳ Seeding Database...';
    }
    toast('Checking and re-seeding default topics...', 'info');
    try {
      await DB.forceReSeed();
      toast('Database defaults successfully re-seeded!', 'success');
      await seedManagerTopics();
    renderTopicsList();
    } catch (e) {
      console.error('Force seed failed:', e);
      alert('Failed to seed database: ' + e.message);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = '⚡ Force Re-seed Defaults';
      }
    }
  }

  // ---- Public API (called from inline onclick) ----
  return {
    init,
    doLogin,
    forceReSeed,
    openTopicModal,
    deleteTopic,
    toggleTopicEnabled,
    enableAllTopics,
    disableAllTopics,
    selectTopicsGroup,
    backToTopicsGroups,
    selectTopicsModule,
    deleteSession,
    reScoreWrittenComm,
    resetWrittenScores,
    // Assessments archive / multi-select / manager view
    switchAssessmentView,
    toggleSessionCheckbox,
    toggleAllSessions,
    archiveSelectedSessions,
    restoreSelectedSessions,
    archiveSingleSession,
    restoreSingleSession,
    openScoring,
    closeScoring,
    saveScoring,
    useAiFeedback,
    drillIntoManager,
    backToManagers,
    archiveAllManagerSessions,
    restoreAllManagerSessions,
    toggleManagerCheckbox,
    toggleAllManagers,
    archiveSelectedManagers,
    restoreSelectedManagers,
    // Bot script per-turn audio upload
    // AI Audit Scores (kept for backward compatibility)
    filterAiAudit,
    toggleAuditCheckbox,
    toggleAllAudit,
    editSelfScore,
    cancelSelfScoreEdit,
    saveSelfScore,
    editAuditScore,
    cancelAuditEdit,
    saveAuditScore,
    deleteSingleAuditScore,
    deleteSelectedAuditScores,
    deleteAllAuditScores,
    // Comm360 Master Report
    filterComm360,
    searchComm360,
    isComm360Deleted: () => _comm360ReportDeleted,
    deleteEntireComm360Report,
    restoreEntireComm360Report,
    downloadMasterExcel,
    // Manager Assessments
    loadMgrAssessments,
    renderMgrAssessments,
    openMgrScoreModal,
    saveMgrScore,
    deleteSingleMgrSession,
    toggleMgrSessionCheckbox,
    toggleAllMgrSessions,
    deleteSelectedMgrSessions,
    exportMgrAssessmentsExcel,
    downloadAllMgrRecordings,
    seedStockMarketMcq,
    // Assessments tab — Export Excel / Download recordings / Delete All
    downloadRecording,
    downloadAllRecordings,
    exportAssessmentsExcel,
    deleteAllSessions,
    // Trainees tab
    loadTrainees,
    searchTrainees,
    toggleTraineeCheckbox,
    toggleAllTrainees,
    setTraineeTeam,
    deleteSelectedTrainees,
    deleteAllTrainees,
    viewTraineeSessions,
    closeTraineeSessionsModal,
  };
})();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => Admin.init());
} else {
  Admin.init();
}
