app_name = "comm_assess"
app_title = "Communication Assessment"
app_publisher = "Your Organization"
app_description = "Corporate Communication Assessment Platform for Frappe Framework"
app_email = "admin@example.com"
app_license = "MIT"

# Includes in <head>
# ------------------
# include js, css files in header of web template
web_include_css = "/assets/comm_assess/css/style.css"
web_include_js = "/assets/comm_assess/js/frappe-db.js"

# Home page route
# ---------------
# home_page = "comm_assess"

# Website user home page
# ----------------------
# role_home_page = {
# 	"System Manager": "comm_assess/admin",
# 	"Trainee": "comm_assess",
# }

# DocType Fixtures
fixtures = [
	{"dt": "Custom Field", "filters": [["module", "=", "Communication Assessment"]]},
	{"dt": "Property Setter", "filters": [["module", "=", "Communication Assessment"]]}
]
