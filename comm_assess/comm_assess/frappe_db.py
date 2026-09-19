"""
CommAssess — Generic Frappe-backed data layer.

Mirrors the exact public contract of the frontend's old Supabase-backed
DB module (init/get/getAll/getByIndex/put/patch/del) so js/db.js can be
swapped to call these endpoints without any changes needed in app.js,
admin.js or manager-app.js.

Each "store" the frontend already uses (trainees, sessions, topics,
settings) maps to one doctype. For trainees/sessions/topics, the Frappe
docname IS the record's "id" and the full record (minus id) is kept as
JSON in a `payload` field, with a few frequently-filtered fields (module,
trainee_id, status) promoted to real columns for fast getByIndex/order-by.
`settings` keeps its original {key, value} shape directly (key = docname).
"""

import json
import frappe


STORE_DOCTYPE = {
	"trainees": "CommAssess Trainee",
	"sessions": "CommAssess Session",
	"topics": "CommAssess Topic",
	"settings": "CommAssess Setting",
}

# Fields promoted out of `payload` into real columns per store, kept in
# sync on every write so getByIndex / getAll ordering can filter on them
# server-side instead of scanning JSON.
INDEXED_FIELDS = {
	"trainees": ["employee_id"],
	"sessions": ["module", "trainee_id", "status", "submitted_at"],
	"topics": ["module", "title"],
}

# camelCase (as used by the frontend) -> the column name we promote it to.
FIELD_ALIASES = {
	"trainees": {"employee_id": "employee_id"},
	"sessions": {
		"module": "module",
		"traineeId": "trainee_id",
		"status": "status",
		"submittedAt": "submitted_at",
	},
	"topics": {"module": "module", "title": "title"},
}


def _doctype(store):
	dt = STORE_DOCTYPE.get(store)
	if not dt:
		frappe.throw(f"Unknown CommAssess store: {store}")
	return dt


def _to_row(store, record):
	"""Split an incoming record dict into (promoted columns, payload json)."""
	record = dict(record or {})
	record.pop("id", None)
	aliases = FIELD_ALIASES.get(store, {})
	cols = {}
	for camel, col in aliases.items():
		if camel in record:
			cols[col] = record[camel]
	return cols, json.dumps(record)


def _from_doc(store, doc):
	"""Rebuild the frontend-shaped record from a stored doc."""
	try:
		record = json.loads(doc.payload) if doc.payload else {}
	except Exception:
		record = {}
	record["id"] = doc.name
	return record


@frappe.whitelist(allow_guest=True)
def db_init():
	return {"ok": True}


@frappe.whitelist(allow_guest=True)
def db_get(store, id=None, key=None):
	dt = _doctype(store)
	if store == "settings":
		name = key or id
		if not name or not frappe.db.exists(dt, name):
			return None
		doc = frappe.get_doc(dt, name)
		return {"key": doc.name, "value": doc.value}

	if not id or not frappe.db.exists(dt, id):
		return None
	doc = frappe.get_doc(dt, id)
	return _from_doc(store, doc)


@frappe.whitelist(allow_guest=True)
def db_get_all(store):
	dt = _doctype(store)
	if store == "settings":
		rows = frappe.get_all(dt, fields=["name as key", "value"], order_by="creation asc")
		return rows

	names = frappe.get_all(dt, fields=["name"], order_by="creation asc")
	out = []
	for n in names:
		doc = frappe.get_doc(dt, n.name)
		out.append(_from_doc(store, doc))
	return out


@frappe.whitelist(allow_guest=True)
def db_get_by_index(store, field, value):
	dt = _doctype(store)
	col = FIELD_ALIASES.get(store, {}).get(field, field)
	names = frappe.get_all(dt, filters={col: value}, fields=["name"], order_by="creation asc")
	out = []
	for n in names:
		doc = frappe.get_doc(dt, n.name)
		out.append(_from_doc(store, doc))
	return out


@frappe.whitelist(allow_guest=True)
def db_put(store, data):
	dt = _doctype(store)
	if isinstance(data, str):
		data = json.loads(data)

	if store == "settings":
		key = data.get("key")
		value = data.get("value")
		if not key:
			frappe.throw("settings.put requires a key")
		if frappe.db.exists(dt, key):
			doc = frappe.get_doc(dt, key)
			doc.value = value
			doc.save(ignore_permissions=True)
		else:
			doc = frappe.get_doc({"doctype": dt, "key": key, "value": value})
			doc.insert(ignore_permissions=True)
		frappe.db.commit()
		return doc.name

	cols, payload = _to_row(store, data)
	record_id = data.get("id")

	if record_id and frappe.db.exists(dt, record_id):
		doc = frappe.get_doc(dt, record_id)
		for k, v in cols.items():
			doc.set(k, v)
		doc.payload = payload
		doc.save(ignore_permissions=True)
	else:
		new_doc = {"doctype": dt, "payload": payload}
		new_doc.update(cols)
		doc = frappe.get_doc(new_doc)
		if record_id:
			doc.name = record_id
		doc.insert(ignore_permissions=True)

	frappe.db.commit()
	return doc.name


@frappe.whitelist(allow_guest=True)
def db_patch(store, id=None, key=None, data=None):
	dt = _doctype(store)
	if isinstance(data, str):
		data = json.loads(data)
	data = data or {}

	if store == "settings":
		name = key or id
		if not name or not frappe.db.exists(dt, name):
			frappe.throw(f"Setting {name} not found")
		doc = frappe.get_doc(dt, name)
		if "value" in data:
			doc.value = data["value"]
		doc.save(ignore_permissions=True)
		frappe.db.commit()
		return {"ok": True}

	if not id or not frappe.db.exists(dt, id):
		frappe.throw(f"{store} record {id} not found")
	doc = frappe.get_doc(dt, id)
	try:
		existing = json.loads(doc.payload) if doc.payload else {}
	except Exception:
		existing = {}
	existing.update(data)
	cols, payload = _to_row(store, existing)
	for k, v in cols.items():
		doc.set(k, v)
	doc.payload = payload
	doc.save(ignore_permissions=True)
	frappe.db.commit()
	return {"ok": True}


@frappe.whitelist(allow_guest=True)
def db_del(store, id=None, key=None):
	dt = _doctype(store)
	name = key or id
	if name and frappe.db.exists(dt, name):
		frappe.delete_doc(dt, name, ignore_permissions=True, force=True)
		frappe.db.commit()
	return {"ok": True}


@frappe.whitelist(allow_guest=True)
def db_upload(folder=None):
	"""Handle a Blob upload (recording / caller audio) into Frappe's File Manager."""
	file = frappe.request.files.get("file")
	if not file:
		frappe.throw("No file uploaded.")
	filename = file.filename or "recording.webm"
	content = file.read()
	saved_file = frappe.get_doc({
		"doctype": "File",
		"file_name": filename,
		"is_private": 0,
		"content": content,
	})
	saved_file.save(ignore_permissions=True)
	frappe.db.commit()
	return {"file_url": saved_file.file_url}
