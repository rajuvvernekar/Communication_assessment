import os

admin_files = [
    "/Users/girisha/Communication_assessment/js/admin.js",
    "/Users/girisha/Communication_assessment/clean_repository/js/admin.js",
    "/Users/girisha/Communication_assessment/comm_assess/comm_assess/public/js/admin.js"
]

for target in admin_files:
    if os.path.exists(target):
        with open(target, "r", encoding="utf-8") as f:
            code = f.read()

        code = code.replace("await await seedManagerTopics();", "await seedManagerTopics();")
        with open(target, "w", encoding="utf-8") as f:
            f.write(code)
        print(f"Fixed double await in {target}")

