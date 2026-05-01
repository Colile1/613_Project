# Modern Stream Processing and Real-Time Data Pipelines

Modern stream processing treats events as the primary unit of computation, enabling systems to continuously react to changing conditions with low latency, with exactly-once (or effectively-once) semantics, and with stateful, time-aware analytics. Unlike batch jobs, streaming pipelines must handle out-of-order events, late arrivals, backpressure, and fault recovery while preserving correctness. This is why stream processing has become foundational to fraud detection, IoT monitoring, real-time personalisation, and microservices observability, where decisions must be taken within seconds (or milliseconds) of event occurrence.


A modern streaming platform is typically implemented as an event-driven architecture with durable event logs, scalable consumers, and stream processors capable of windowing, enrichment, joins, and state management. Systems such as Kafka/Flink/Kinesis or Azure-native equivalents provide the backbone for continuous computation, while observability tooling ensures that pipelines are trustworthy, auditable, and operable at scale.


## Project Overview

This project aims to demonstrate the creation of a scalable, real-time streaming data pipeline using a blend of cloud-native services and modern stream processing frameworks. The project will highlight the benefits of low-latency data processing, fault tolerance, scalability, and observability—all key principles of modern stream processing architectures.

The architecture will incorporate:

Azure Event Hubs
Azure Stream Analytics
Azure CosmosDB for storing data
PowerBI for visualising streaming data
Custom Python, Apache Beam, or other scripting tools for stream processing and transformations
Optional: Integration with AI/ML models for real-time insights and anomaly detection

Example Real-World Scenario Options

Credit card transaction fraud monitoring
IoT telemetry pipeline for smart campus / smart building
Microservices observability (request traces, error events, latency metrics)
Cybersecurity event streaming (authentication events, alerts, anomalies)

Project Implementation Guidelines

You are required to build a streaming data pipeline using the Azure platform. If you have a compelling reason to use an alternative platform, please discuss it with me beforehand. You do not need to implement all components; you may scale down the solution based on your use case. For example, a minimal implementation could include a single data source, an Event Hub, a database, and a visualisation tool—or any combination of technologies that effectively demonstrate a streaming application.

A typical implementation consists of the following components. See the reference implementation here https://learn.microsoft.com/en-us/azure/architecture/reference-architectures/data/stream-processing-stream-analytics. You may use this as the foundation of your implementation.

 





Key Requirements:

Real-Time Data Generation and Simulation
Implement multiple heterogeneous real-time data sources (e.g., transactional events, IoT telemetry, security logs).

Simulate some realistic production characteristics:

Variable throughput
Burst traffic
Out-of-order events
Duplicate events
Late-arriving data
Include unique event identifiers and timestamps (event-time vs processing-time distinction).

Provide data schema definitions.


Ingest streams through Azure Event Hubs with proper partition design. Justify partition key strategy based on scalability and ordering requirements.

Stream processing (Azure Stream Analytics)
Implement event-time windowing, and perform (stream filtering, aggregations, stream–reference joins (e.g., enrichment lookup), basic anomaly detection). Route invalid or malformed events to a dead-letter output. Measure and document processing latency, throughput, query parallelism and scaling behaviour.

Store processed events as optimised JSON documents in CosmosDB

Real-time analytics and dynamic visualisation - Connect Power BI to Cosmos DB (or streaming dataset). Build a dashboard that updates dynamically. Visualise real-time KPIs, event trends, throughput and latency metrics, alert/anomaly indicators. Implement at least one actionable insight (e.g., threshold alert, anomaly flag). Demonstrate dynamic filtering and drill-down analysis.



Aspects of the implementation will be discussed in class throughout the semester.


Ensure you track your Azure credits carefully so they do not exceed the $100 credit limit. If you do it well, you should spend only about $10. Use the costing and notifications to alert you to your cost escalations.


Some potential enhancements for those who are more adventurous:


Advanced Data Processing and Enrichment

Use Apache Flink or Azure Databricks for Stream Processing

Replace Azure Stream Analytics with Apache Flink (via Azure Managed Service for Apache Flink) for low-latency, stateful event processing.
Databricks Structured Streaming can be used for ML-based event processing.
Data Enrichment with External APIs

Augment real-time data with external APIs, geolocation services, or metadata sources (e.g., enriching transactions with customer demographics).

AI/ML Integration for Predictive Insights

Real-Time Anomaly Detection

Use Azure Machine Learning or Databricks ML for fraud detection, predictive maintenance, or customer behaviour analysis.
Deploy pre-trained ML models within the stream processing layer to detect anomalies in real-time.
Intelligent Alerting System

Integrate Azure Logic Apps or Azure Functions to send automated alerts via Teams, Slack, or Email when anomalies are detected.

Visualisation and Business Intelligence Enhancements

Use Real-Time Power BI Dashboards with DirectQuery

Instead of batch loading data, enable Power BI DirectQuery on Cosmos DB or Azure Data Explorer for real-time analytics dashboards.
AI-Powered Insights in Power BI

Enable Power BI AI Visuals (like key influencers and anomaly detection) to uncover hidden patterns.
Additional resources for assignment
No attachments yet

Grading Rubric

## Project Rubric_2026
Problem definition, scenario justification, and UML architecture design

Limited
Scenario is vague, weakly defined, or not clearly suitable for stream processing. Little or no explanation of why real-time processing is needed. UML architecture diagram is missing, incorrect, or too unclear to communicate the system structure.

4 Points	
Sarisfactory
Scenario is defined at a basic level and is somewhat appropriate for streaming. Some motivation for real-time processing is given, but the justification is limited. A basic UML architecture diagram is included, showing some major components, but it lacks clarity, completeness, or correct relationships.

6 Points	
Strong
Scenario is realistic, clearly defined, and well suited to stream processing. The need for low-latency or continuous processing is explained well. A clear UML architecture diagram is provided, showing the main system components, data flow, and major interactions in a logically organised way.

9 Points	
Excellent
Scenario is highly relevant, realistic, and strongly justified as a streaming problem. The student clearly explains why stream processing is preferable to batch processing and identifies meaningful operational or business questions. The UML architecture diagram is accurate, well structured, and professionally presented, clearly showing components, data flows, external entities, storage, processing, and reporting layers in a way that strengthens the overall design justification.

12 Points
Data generation, realism, and schema design

Limited
Data stream is trivial, poorly structured, or unrealistic. Little evidence of schema design. Missing IDs or timestamps. No meaningful simulation of streaming behaviour

0 Points	
Satisfactory
Data stream is usable but basic. Schema is partially documented. Includes some event identifiers and timestamps, but limited realism. Minimal simulation of streaming characteristics

5 Points	
Strong
Data stream is well structured, schema is documented, and data is realistic for the use case. Includes IDs, timestamps, and multiple meaningful event fields. Demonstrates some realistic streaming behaviours such as burstiness, duplicates, or variable throughput.

10 Points	
Excellent
Data stream is rich, well documented, and convincingly realistic. Schema is clearly defined and appropriate. Includes event IDs, event-time and processing-time awareness, and multiple production-like behaviours such as burst traffic, out-of-order events, duplicates, and late arrivals.

15 Points
Ingestion architecture and Event Hubs design

Limited
Event ingestion is incomplete, unreliable, or poorly explained. Event Hubs is absent, misconfigured, or used superficially. No meaningful partitioning justification.

5 Points	
Satisfactory
Event ingestion works at a basic level. Event Hubs is configured correctly enough for demonstration. Some partitioning or ingestion explanation is given, but justification is weak.

8 Points	
Strong
Event ingestion is functional and well explained. Event Hubs is configured appropriately. The partition count and partition key are reasonably chosen and aligned with scalability or ordering needs.

11 Points	
Excellent
Event ingestion is robust, well justified, and aligned with streaming requirements. Event Hubs design reflects a clear understanding of partitioning, ordering, scalability, and trade-offs. The partition key strategy is convincingly justified in relation to the data and use case.

15 Points
Stream processing design and correctness

Limited
Processing logic is minimal, incorrect, or mostly batch-like in nature. Little evidence of event-time thinking. Queries are trivial or poorly matched to the problem.

9 Points	
Satisfactory
Basic stream processing is implemented, such as simple filtering or aggregation. Some understanding of streaming is shown, but treatment of time, windows, or correctness is limited.

14 Points	
Strong
Stream processing includes meaningful filtering, aggregation, and event-time windowing. Logic is correct for the chosen scenario. May include enrichment, joins, or basic anomaly detection. Student shows a clear understanding of streaming semantics.

19 Points	
Excellent
Stream processing is sophisticated, correct, and well matched to the use case. Demonstrates event-time windowing, meaningful aggregations, joins or enrichment where appropriate, anomaly detection or alert logic, and careful treatment of streaming concerns such as late arrivals, out-of-order events, invalid events, or dead-letter handling.

25 Points
Storage and Cosmos DB data modelling

Limited
Storage layer is poorly designed, missing, or weakly connected to the use case. Data model is unclear or unsuitable.

3 Points	
Satisfactory
Processed data is stored correctly at a basic level. Document structure is usable, but modelling choices are not well justified.

5 Points	
Strong
Cosmos DB is used appropriately, with a sensible document model and reasonable alignment to the query or dashboard requirements. Some consideration of partitioning or efficiency is evident.

7 Points	
Excellent
Cosmos DB design is well thought out and justified. Document structure, partitioning, indexing, and storage choices are clearly aligned with streaming output, efficient querying, and scalability requirements.

10 Points
Power BI real-time analytics, report quality, and actionable insight

Limited
Power BI artefact is weak, incomplete, or mostly decorative. Visuals are inappropriate or minimally informative. Little evidence of structure, interpretation, or technical explanation.

6 Points	
Satisfactory
Power BI artefact is functional and presents basic metrics or visuals. Some report structure is evident, but explanation, interaction, and interpretation are limited. Visual choices are adequate but basic.

10 Points	
Strong
Power BI artefact is clear, logically structured, and useful for real-time analysis. Visuals are appropriate for KPIs, trends, alerts, or throughput. Supports interaction such as filtering or drill-down. Measures, design choices, and findings are explained reasonably well.

14 Points	
Excellent
Power BI artefact is polished, coherent, and analytically strong. It functions both as a real-time dashboard and as a structured analytical report. Visuals are well chosen for each metric, support dynamic analysis, and communicate trends, anomalies, and operational state clearly. The student explains visual logic, report structure, design choices, insights, trade-offs, and decision-support value in a technically mature way, including at least one actionable insight such as alerting, anomaly flagging, or threshold-based interpretation.

18 Points
Observability, performance evaluation, and cost awareness

Limited
Little or no evidence of monitoring, performance measurement, or operational thinking. No discussion of latency, throughput, scaling, or cost.

3 Points	
Satisfactory
Some basic performance or operational discussion is included, but evidence is limited. Monitoring and cost awareness are mentioned only superficially.

5 Points	
Strong
Student measures or discusses relevant operational metrics such as latency, throughput, or scaling behaviour. Some observability and cost-awareness practices are shown.

7 Points	
Excellent
Strong evidence of engineering maturity. Student measures and interprets latency, throughput, scaling behaviour, or query parallelism, and demonstrates observability thinking. Cost control, budget awareness, or resource management is explicitly considered and managed well.

10 Points
Advanced features and innovation

Limited
No advanced features beyond the minimum, or extensions are attempted unsuccessfully.

1 Points	
Satisfactory
One modest extension is attempted, but integration or relevance is limited.

2 Points	
Strong
Includes one meaningful advanced enhancement, such as API enrichment, automated alerting, richer anomaly logic, or alternative processing tools, with reasonable integration.

3 Points	
Excellent
Includes substantial and well-executed advanced work that clearly strengthens the project, such as ML-based anomaly detection, external enrichment, intelligent alerting, advanced observability, or use of Beam, Flink, Databricks, or Functions with strong justification.

5 Points