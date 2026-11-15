# The ultrasound model service. Build from the ai/ folder:
#   docker build -f ultrasound_service/Dockerfile ai/
FROM python:3.12-slim
WORKDIR /srv
# CPU-only PyTorch: far smaller than the default build, and the models do not need a graphics card.
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu
COPY ultrasound_service/requirements.txt ultrasound_service/
RUN pip install --no-cache-dir -r ultrasound_service/requirements.txt
COPY jugular_ultrasound/*.py jugular_ultrasound/
COPY jugular_ultrasound/results/fits/*.pt jugular_ultrasound/results/fits/
COPY heart_ultrasound/*.py heart_ultrasound/
COPY heart_ultrasound/final_model/ heart_ultrasound/final_model/
COPY ultrasound_service/*.py ultrasound_service/
ENV ULTRASOUND_HOST=0.0.0.0 ULTRASOUND_PORT=8790
EXPOSE 8790
CMD ["python", "-W", "ignore", "ultrasound_service/server.py"]
