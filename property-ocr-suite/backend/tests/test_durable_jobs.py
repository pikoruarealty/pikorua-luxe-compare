from app.durable_jobs import ValidationResult, sha256_file, validate_extraction


def test_checksum_is_stable(tmp_path):
    document = tmp_path / "brochure.pdf"
    document.write_bytes(b"%PDF-1.7\ncanonical")
    assert sha256_file(document) == "af4834f9f50c9eacdf4b8b0d073d266555454b2f09f496f6ebaee26b2158f585"


def test_hard_validation_rejects_negative_commercial_values():
    result = validate_extraction(
        {
            "basics": {},
            "configurations": [{"price": {"value": -1}}],
        }
    )
    assert not result.can_continue
    assert "configuration_0_price_negative" in result.hard_failures


def test_soft_validation_flags_area_ordering_without_guessing():
    result = validate_extraction(
        {
            "basics": {},
            "configurations": [
                {
                    "super_built_up_area": {"value": 1000},
                    "carpet_area": {"value": 1200},
                }
            ],
        }
    )
    assert result == ValidationResult((), ("configuration_0_carpet_exceeds_super_area",))
    assert result.can_continue
