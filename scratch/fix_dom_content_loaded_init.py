import os
import re

files_to_fix = [
    ("/Users/girisha/Communication_assessment/js/admin.js", "Admin.init()", "document.addEventListener('DOMContentLoaded', () => Admin.init());"),
    ("/Users/girisha/Communication_assessment/clean_repository/js/admin.js", "Admin.init()", "document.addEventListener('DOMContentLoaded', () => Admin.init());"),
    ("/Users/girisha/Communication_assessment/comm_assess/comm_assess/public/js/admin.js", "Admin.init()", "document.addEventListener('DOMContentLoaded', () => Admin.init());"),
    
    ("/Users/girisha/Communication_assessment/js/manager-app.js", "MgrApp.init()", "document.addEventListener('DOMContentLoaded', () => MgrApp.init());"),
    ("/Users/girisha/Communication_assessment/clean_repository/js/manager-app.js", "MgrApp.init()", "document.addEventListener('DOMContentLoaded', () => MgrApp.init());"),
    ("/Users/girisha/Communication_assessment/comm_assess/comm_assess/public/js/manager-app.js", "MgrApp.init()", "document.addEventListener('DOMContentLoaded', () => MgrApp.init());"),

    ("/Users/girisha/Communication_assessment/js/app.js", "App.init()", "document.addEventListener('DOMContentLoaded', () => App.init());"),
    ("/Users/girisha/Communication_assessment/clean_repository/js/app.js", "App.init()", "document.addEventListener('DOMContentLoaded', () => App.init());"),
    ("/Users/girisha/Communication_assessment/comm_assess/comm_assess/public/js/app.js", "App.init()", "document.addEventListener('DOMContentLoaded', () => App.init());")
]

for file_path, init_fn, target_line in files_to_fix:
    if os.path.exists(file_path):
        with open(file_path, "r", encoding="utf-8") as f:
            code = f.read()

        safe_init = f"if (document.readyState === 'loading') {{\n  document.addEventListener('DOMContentLoaded', () => {init_fn});\n}} else {{\n  {init_fn};\n}}"

        if target_line in code:
            code = code.replace(target_line, safe_init)
            with open(file_path, "w", encoding="utf-8") as f:
                f.write(code)
            print(f"Fixed DOM init in {file_path}")

