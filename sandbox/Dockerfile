FROM eclipse-temurin:21-jdk-alpine
WORKDIR /opt/runner
COPY Runner.java .
RUN javac --release 21 Runner.java && rm Runner.java && mkdir /work
USER 65534:65534
WORKDIR /work
ENTRYPOINT ["java", "-Xmx32m", "-XX:ActiveProcessorCount=1", "-XX:+UseSerialGC", "-cp", "/opt/runner", "Runner"]
