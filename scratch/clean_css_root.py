import os
import re

css_files = [
    "/Users/girisha/Communication_assessment/css/style.css",
    "/Users/girisha/Communication_assessment/clean_repository/css/style.css",
    "/Users/girisha/Communication_assessment/comm_assess/comm_assess/public/css/style.css"
]

clean_root = """:root {
  --bg: #f4f5f6;
  --surface: #ffffff;
  --sidebar: #1f2937;
  --sidebar-text: #9ca3af;
  --sidebar-active: #ffffff;
  --primary: #2490ef;
  --primary-hover: #1d7cd1;
  --text: #1f2937;
  --text-muted: #6b7280;
  --border: #e5e7eb;
  --success: #10b981;
  --danger: #ef4444;
  --warning: #f59e0b;

  /* Plain Frappe minimal module colors */
  --ps-color: #2490ef;
  --mc-color: #2490ef;
  --rp-color: #2490ef;
  --gd-color: #2490ef;
  --wc-color: #2490ef;
  --ga-color: #2490ef;
  --la-color: #2490ef;
  --smq-color: #2490ef;

  --radius: 6px;
  --shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
  --shadow-lg: 0 4px 6px -1px rgba(0, 0, 0, 0.08);
}"""

for target in css_files:
    if os.path.exists(target):
        with open(target, "r", encoding="utf-8") as f:
            content = f.read()

        # Replace top :root block
        content = re.sub(r":root\s*\{[^}]+\}", clean_root, content, count=1)
        
        with open(target, "w", encoding="utf-8") as f:
            f.write(content)
        print(f"Cleaned root variables in {target}")

