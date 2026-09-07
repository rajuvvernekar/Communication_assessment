from setuptools import setup, find_packages

with open("requirements.txt") as f:
	install_requires = f.read().strip().split("\n")

from comm_assess import __version__ as version

setup(
	name="comm_assess",
	version=version,
	description="Corporate Communication Assessment Platform for Frappe",
	author="Your Organization",
	author_email="admin@example.com",
	packages=find_packages(),
	zip_safe=False,
	include_package_data=True,
	install_requires=install_requires
)
