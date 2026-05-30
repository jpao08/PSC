from adapters.output.supabase_bitrix_user_directory import _normalize_text, _to_bitrix_user


def test_normalize_text_removes_accents() -> None:
    assert _normalize_text("João Pedro") == "joao pedro"


def test_to_bitrix_user_maps_dim_user_shape() -> None:
    parsed = _to_bitrix_user(
        {
            "bitrix_user_id": "3031",
            "full_name": "João Pedro Alfradique Oliveira",
            "email": "joao.oliveira@tedsustentavel.com",
            "is_active": True,
        }
    )
    assert parsed is not None
    assert parsed.id == "3031"
    assert parsed.name == "João Pedro Alfradique Oliveira"
    assert parsed.email == "joao.oliveira@tedsustentavel.com"
