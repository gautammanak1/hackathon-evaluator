from hackathon_eval.pdf_urls import find_github_repo_urls


def test_find_multiple_urls_order_and_dedupe():
    text = """
    row1 https://github.com/foo/bar-alpha
    Also see http://github.com/foo/bar-alpha duplicate
    https://github.com/org/Other-Repo/wiki
    """
    u = find_github_repo_urls(text)
    assert u[0] == "https://github.com/foo/bar-alpha"
    assert u[1] == "https://github.com/org/Other-Repo"
    assert len(u) == 2


def test_find_optional_scheme():
    text = "see github.com/acme/demo.git for code"
    u = find_github_repo_urls(text)
    assert u == ["https://github.com/acme/demo"]
