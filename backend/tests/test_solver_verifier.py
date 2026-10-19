"""Independent tests for concrete C01-C09 verification."""

import copy

import pytest

from backend.app.errors import APIError
from backend.app.solver_verifier import verify_assignments


@pytest.fixture()
def payload():
    return {
        "praktikum": [
            {"id": 1, "mata_praktikum_id": 1, "kelompok_id": 1, "asisten_id": 1},
            {"id": 2, "mata_praktikum_id": 1, "kelompok_id": 2, "asisten_id": 2},
        ],
        "kelompok": [{"id": 1, "jumlah_peserta": 20}, {"id": 2, "jumlah_peserta": 10}],
        "laboratorium": [{"id": 1, "kapasitas": 20}, {"id": 2, "kapasitas": 30}],
        "slot_waktu": [
            {"id": 1, "hari": 1, "jam_mulai": "08:00", "jam_selesai": "10:00"},
            {"id": 2, "hari": 1, "jam_mulai": "10:00", "jam_selesai": "12:00"},
            {"id": 3, "hari": 1, "jam_mulai": "09:00", "jam_selesai": "11:00"},
            {"id": 4, "hari": 2, "jam_mulai": "08:00", "jam_selesai": "10:00"},
        ],
        "ketersediaan_kelompok": [
            {"kelompok_id": group, "slot_id": slot} for group in (1,2) for slot in (1,2,3,4)
        ],
        "ketersediaan_asisten": [
            {"asisten_id": assistant, "slot_id": slot} for assistant in (1,2) for slot in (1,2,3,4)
        ],
    }


def assignments():
    return [
        {"praktikum_id": 1, "slot_id": 1, "laboratorium_id": 1},
        {"praktikum_id": 2, "slot_id": 2, "laboratorium_id": 1},
    ]


def rejected(payload, result):
    with pytest.raises(APIError) as caught:
        verify_assignments(payload, result)
    assert caught.value.code == "SOLVER_PROTOCOL_ERROR"


def test_valid_assignments_and_adjacent_intervals(payload):
    verify_assignments(payload, assignments())


@pytest.mark.parametrize("result", (
    [{"praktikum_id":1,"slot_id":1,"laboratorium_id":1}],
    [{"praktikum_id":1,"slot_id":1,"laboratorium_id":1}]*2,
    [{"praktikum_id":1,"slot_id":1,"laboratorium_id":1},{"praktikum_id":99,"slot_id":2,"laboratorium_id":1}],
    [{"praktikum_id":1,"slot_id":99,"laboratorium_id":1},{"praktikum_id":2,"slot_id":2,"laboratorium_id":1}],
    [{"praktikum_id":1,"slot_id":1,"laboratorium_id":99},{"praktikum_id":2,"slot_id":2,"laboratorium_id":1}],
))
def test_c01_c02_c03_and_unknown_references_rejected(payload, result):
    rejected(payload, result)


def test_c04_capacity_rejected(payload):
    result = assignments(); result[0]["laboratorium_id"] = 2
    payload["laboratorium"][1]["kapasitas"] = 19
    rejected(payload, result)


@pytest.mark.parametrize("shared_field", ("kelompok_id", "asisten_id"))
def test_c05_c06_use_actual_half_open_overlap(payload, shared_field):
    payload["praktikum"][1][shared_field] = payload["praktikum"][0][shared_field]
    result = assignments(); result[1]["slot_id"] = 3
    rejected(payload, result)


def test_c07_laboratory_overlap_rejected_even_for_different_slot_ids(payload):
    result = assignments(); result[1]["slot_id"] = 3
    rejected(payload, result)


@pytest.mark.parametrize("key,owner_key", (("ketersediaan_kelompok","kelompok_id"),("ketersediaan_asisten","asisten_id")))
def test_c08_c09_availability_rejected(payload, key, owner_key):
    owner = payload["praktikum"][0][owner_key]
    payload[key] = [item for item in payload[key] if (item[owner_key],item["slot_id"]) != (owner,1)]
    rejected(payload, assignments())


def test_different_days_do_not_overlap(payload):
    payload["praktikum"][1]["kelompok_id"] = 1
    result = assignments(); result[1]["slot_id"] = 4
    verify_assignments(payload, result)


def test_invalid_payload_reference_is_safely_rejected(payload):
    broken = copy.deepcopy(payload)
    broken["praktikum"][0]["kelompok_id"] = 999
    rejected(broken, assignments())
