FROM ubuntu:24.04

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    wget \
    git \
    vim \
    nano \
    python3 \
    python3-pip \
    python3-venv \
    nodejs \
    npm \
    r-base \
    build-essential \
    libssl-dev \
    libffi-dev \
    libxml2-dev \
    libxslt1-dev \
    libjpeg-dev \
    zlib1g-dev \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Create claude user
RUN useradd -m -s /bin/bash claude && \
    mkdir -p /home/claude/.npm-global && \
    chown -R claude:claude /home/claude

# Set up Python environment
RUN pip3 install --upgrade pip --break-system-packages

# Install common scientific Python packages
RUN pip3 install --break-system-packages \
    numpy \
    pandas \
    scipy \
    matplotlib \
    seaborn \
    scikit-learn \
    transformers \
    torch \
    tensorflow \
    jupyter \
    ipython \
    requests \
    beautifulsoup4 \
    lxml \
    openpyxl \
    python-docx \
    pypdf2 \
    pillow

# Install medical/research specific packages
RUN pip3 install --break-system-packages \
    biopython \
    pydicom \
    nibabel \
    neurokit2 \
    mne \
    nilearn \
    statsmodels \
    lifelines \
    scikit-survival

# Install document processing tools
RUN pip3 install --break-system-packages \
    python-pptx \
    pymupdf \
    reportlab \
    markdown \
    pdfplumber

# Set up directories
RUN mkdir -p /mnt/user-data/uploads && \
    mkdir -p /mnt/user-data/outputs && \
    mkdir -p /mnt/skills/user && \
    mkdir -p /mnt/skills/public && \
    mkdir -p /mnt/transcripts && \
    chown -R claude:claude /mnt/user-data && \
    chown -R claude:claude /mnt/skills && \
    chown -R claude:claude /home/claude

# Set up npm global directory
ENV NPM_CONFIG_PREFIX=/home/claude/.npm-global
ENV PATH=/home/claude/.npm-global/bin:$PATH

USER claude
WORKDIR /home/claude

# Create workspace directories
RUN mkdir -p /home/claude/workspace && \
    mkdir -p /home/claude/.config

# Copy entrypoint script
COPY --chown=claude:claude entrypoint.sh /home/claude/
RUN chmod +x /home/claude/entrypoint.sh

ENTRYPOINT ["/home/claude/entrypoint.sh"]
CMD ["/bin/bash"]
