"""Canonical expected Flask API v1 method/path inventory for route tests."""

RESOURCES = (
    "mata-praktikum", "kelompok", "asisten", "laboratorium", "slot-waktu", "praktikum",
)

EXPECTED_API_OPERATIONS = set()
for resource in RESOURCES:
    collection = f"/api/v1/{resource}"
    detail = f"{collection}/<int:resource_id>"
    EXPECTED_API_OPERATIONS.update({
        ("GET", collection), ("GET", detail), ("POST", collection),
        ("PATCH", detail), ("PATCH", f"{detail}/status"),
    })

for owner in ("kelompok", "asisten"):
    availability = f"/api/v1/{owner}/<int:owner_id>/ketersediaan"
    EXPECTED_API_OPERATIONS.update({("GET", availability), ("PUT", availability)})

EXPECTED_API_OPERATIONS.update({
    ("POST", "/api/v1/jadwal/generate"),
    ("POST", "/api/v1/jadwal/simpan"),
    ("GET", "/api/v1/jadwal/aktif"),
    ("GET", "/api/v1/jadwal/riwayat"),
    ("GET", "/api/v1/jadwal/riwayat/<int:version_id>"),
    ("GET", "/api/v1/health"),
})

assert len(EXPECTED_API_OPERATIONS) == 40
