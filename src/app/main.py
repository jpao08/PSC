from app.wiring import build_container

def main() -> None:
    container = build_container(value=-1)
    report = container["use_case"].execute()
    print(f"Done. Issues: {len(report.issues)}")

if __name__ == "__main__":
    main()
