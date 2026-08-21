from app import learning_hints
from app.config import settings


def _hints_dir(monkeypatch, tmp_path):
    hints_dir = tmp_path / "hints"
    monkeypatch.setattr(settings, "HINTS_DIR", hints_dir)
    hints_dir.mkdir(parents=True, exist_ok=True)
    return hints_dir


def test_format_fingerprint_buckets_by_page_count_band():
    assert learning_hints.format_fingerprint(1, 5) == "1f-1-10p"
    assert learning_hints.format_fingerprint(2, 10) == "2f-1-10p"
    assert learning_hints.format_fingerprint(2, 11) == "2f-11-25p"
    assert learning_hints.format_fingerprint(1, 25) == "1f-11-25p"
    assert learning_hints.format_fingerprint(1, 26) == "1f-26-40p"
    assert learning_hints.format_fingerprint(1, 40) == "1f-26-40p"
    assert learning_hints.format_fingerprint(3, 41) == "3f-40p+"


def test_record_corrections_round_trips_through_get_hint_text(monkeypatch, tmp_path):
    _hints_dir(monkeypatch, tmp_path)
    written = learning_hints.record_corrections(
        "Prestige Group",
        "1f-11-25p",
        "job-1",
        [
            {"field": "rate_per_sqft", "corrected": "9500", "extracted": "95000", "page": 4},
            {"field": "possession_date", "corrected": "Dec 2027", "extracted": None, "page": None},
        ],
    )
    assert written == 2

    hint = learning_hints.get_hint_text("Prestige Group")
    assert hint is not None
    assert '"rate_per_sqft": was misread as "95000", should read like "9500"' in hint
    assert '"possession_date": was previously missed' in hint


def test_record_corrections_skips_entries_missing_required_fields(monkeypatch, tmp_path):
    _hints_dir(monkeypatch, tmp_path)
    written = learning_hints.record_corrections(
        "Prestige Group",
        "1f-11-25p",
        "job-1",
        [
            {"field": "", "corrected": "9500"},
            {"field": "rate_per_sqft", "corrected": ""},
            {"corrected": "9500"},
            {"field": "rate_per_sqft", "corrected": "9500"},
        ],
    )
    assert written == 1


def test_record_corrections_is_a_no_op_without_developer_name_or_corrections(monkeypatch, tmp_path):
    hints_dir = _hints_dir(monkeypatch, tmp_path)
    assert learning_hints.record_corrections("", "1f-11-25p", "job-1", [{"field": "a", "corrected": "b"}]) == 0
    assert learning_hints.record_corrections("Prestige Group", "1f-11-25p", "job-1", []) == 0
    assert list(hints_dir.glob("*.jsonl")) == []


def test_get_hint_text_returns_none_for_unknown_developer(monkeypatch, tmp_path):
    _hints_dir(monkeypatch, tmp_path)
    assert learning_hints.get_hint_text("Nobody Ever Uploaded") is None


def test_get_hint_text_returns_none_for_blank_developer_name(monkeypatch, tmp_path):
    _hints_dir(monkeypatch, tmp_path)
    assert learning_hints.get_hint_text(None) is None
    assert learning_hints.get_hint_text("") is None


def test_get_hint_text_keeps_only_the_most_recent_correction_per_field(monkeypatch, tmp_path):
    _hints_dir(monkeypatch, tmp_path)
    learning_hints.record_corrections(
        "Prestige Group", "1f-11-25p", "job-1",
        [{"field": "rate_per_sqft", "corrected": "9500", "extracted": "95000"}],
    )
    learning_hints.record_corrections(
        "Prestige Group", "1f-11-25p", "job-2",
        [{"field": "rate_per_sqft", "corrected": "9700", "extracted": "96000"}],
    )
    hint = learning_hints.get_hint_text("Prestige Group")
    assert hint is not None
    assert hint.count('"rate_per_sqft"') == 1
    assert 'should read like "9700"' in hint
    assert "9500" not in hint


def test_get_hint_text_respects_the_limit(monkeypatch, tmp_path):
    _hints_dir(monkeypatch, tmp_path)
    corrections = [
        {"field": f"field_{i}", "corrected": str(i), "extracted": None} for i in range(5)
    ]
    learning_hints.record_corrections("Prestige Group", "1f-11-25p", "job-1", corrections)
    hint = learning_hints.get_hint_text("Prestige Group", limit=2)
    assert hint is not None
    assert sum(hint.count(f'"field_{i}"') for i in range(5)) == 2


def test_hints_are_scoped_per_developer(monkeypatch, tmp_path):
    _hints_dir(monkeypatch, tmp_path)
    learning_hints.record_corrections(
        "Prestige Group", "1f-11-25p", "job-1",
        [{"field": "rate_per_sqft", "corrected": "9500", "extracted": "95000"}],
    )
    assert learning_hints.get_hint_text("Godrej Properties") is None


def test_malformed_lines_in_the_hints_file_are_skipped_not_fatal(monkeypatch, tmp_path):
    hints_dir = _hints_dir(monkeypatch, tmp_path)
    path = hints_dir / f"{learning_hints._safe_key('Prestige Group')}.jsonl"
    path.write_text("not json\n{\"field\": \"rate_per_sqft\", \"corrected\": \"9500\"}\n")
    # A malformed line is missing required Correction fields entirely, so it
    # also fails to construct even once past json.loads — both cases are
    # tolerated the same way.
    assert learning_hints.get_hint_text("Prestige Group") is None
