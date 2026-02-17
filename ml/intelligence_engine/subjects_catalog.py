from typing import Dict, List


SUBJECT_CATALOG: Dict[str, List[str]] = {
    "mathematics": [
        "arithmetic",
        "algebra",
        "geometry",
        "trigonometry",
        "calculus",
        "linear algebra",
        "probability",
        "statistics",
        "differential equations",
        "number theory",
        "discrete mathematics",
        "optimization",
    ],
    "physics": [
        "mechanics",
        "thermodynamics",
        "electromagnetism",
        "optics",
        "waves",
        "quantum physics",
        "relativity",
        "fluid dynamics",
        "solid state physics",
    ],
    "chemistry": [
        "organic chemistry",
        "inorganic chemistry",
        "physical chemistry",
        "analytical chemistry",
        "biochemistry",
        "thermochemistry",
    ],
    "biology": [
        "cell biology",
        "genetics",
        "molecular biology",
        "ecology",
        "evolution",
        "anatomy",
        "physiology",
        "microbiology",
    ],
    "computer_science": [
        "algorithms",
        "data structures",
        "programming",
        "software engineering",
        "operating systems",
        "databases",
        "networking",
        "machine learning",
        "ai safety",
        "cybersecurity",
        "distributed systems",
    ],
    "engineering": [
        "electrical engineering",
        "mechanical engineering",
        "civil engineering",
        "chemical engineering",
        "materials engineering",
        "control systems",
    ],
    "medicine": [
        "anatomy",
        "pathology",
        "pharmacology",
        "public health",
        "epidemiology",
    ],
    "social_sciences": [
        "economics",
        "political science",
        "psychology",
        "sociology",
        "anthropology",
        "geography",
    ],
    "humanities": [
        "history",
        "philosophy",
        "linguistics",
        "literature",
        "religious studies",
        "ethics",
    ],
    "business": [
        "finance",
        "accounting",
        "marketing",
        "operations",
        "strategy",
        "entrepreneurship",
    ],
    "law": [
        "constitutional law",
        "contract law",
        "criminal law",
        "international law",
        "data protection law",
    ],
    "arts": [
        "music theory",
        "visual arts",
        "film studies",
        "design",
        "architecture",
    ],
}


def flatten_subjects() -> List[str]:
    out: List[str] = []
    for top, children in SUBJECT_CATALOG.items():
        out.append(top)
        out.extend(children)
    return out

