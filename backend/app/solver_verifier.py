"""Verifier independen untuk assignment konkret C01-C09."""

from typing import Any

from .errors import APIError


def _protocol_error() -> APIError:
    return APIError(
        "SOLVER_PROTOCOL_ERROR",
        "Mesin penjadwalan menghasilkan respons tidak valid.",
        502,
    )


def _minutes(value: str) -> int:
    hour, minute = value.split(":")
    return int(hour) * 60 + int(minute)


def _overlap(first: dict[str, Any], second: dict[str, Any]) -> bool:
    return (
        first["hari"] == second["hari"]
        and _minutes(first["jam_mulai"]) < _minutes(second["jam_selesai"])
        and _minutes(second["jam_mulai"]) < _minutes(first["jam_selesai"])
    )


def verify_assignments(payload: dict[str, Any], assignments: list[dict[str, Any]]) -> None:
    """Raise a public-safe protocol error unless assignments satisfy C01-C09."""
    try:
        praktikum = {item["id"]: item for item in payload["praktikum"]}
        slots = {item["id"]: item for item in payload["slot_waktu"]}
        labs = {item["id"]: item for item in payload["laboratorium"]}
        groups = {item["id"]: item for item in payload["kelompok"]}
        group_availability = {
            (item["kelompok_id"], item["slot_id"])
            for item in payload["ketersediaan_kelompok"]
        }
        assistant_availability = {
            (item["asisten_id"], item["slot_id"])
            for item in payload["ketersediaan_asisten"]
        }
        assignment_ids = [item["praktikum_id"] for item in assignments]
        if len(assignment_ids) != len(set(assignment_ids)) or set(assignment_ids) != set(praktikum):
            raise ValueError

        resolved = []
        for assignment in assignments:
            p = praktikum[assignment["praktikum_id"]]
            slot = slots[assignment["slot_id"]]
            lab = labs[assignment["laboratorium_id"]]
            group = groups[p["kelompok_id"]]
            if lab["kapasitas"] < group["jumlah_peserta"]:
                raise ValueError
            if (p["kelompok_id"], slot["id"]) not in group_availability:
                raise ValueError
            if (p["asisten_id"], slot["id"]) not in assistant_availability:
                raise ValueError
            resolved.append((p, slot, lab))

        for index, (p1, slot1, lab1) in enumerate(resolved):
            for p2, slot2, lab2 in resolved[index + 1 :]:
                if not _overlap(slot1, slot2):
                    continue
                if p1["kelompok_id"] == p2["kelompok_id"]:
                    raise ValueError
                if p1["asisten_id"] == p2["asisten_id"]:
                    raise ValueError
                if lab1["id"] == lab2["id"]:
                    raise ValueError
    except (KeyError, TypeError, ValueError, AttributeError):
        raise _protocol_error() from None
