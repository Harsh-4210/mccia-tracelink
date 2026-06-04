# TraceLink Demo Information

Here is a comprehensive breakdown of the details required for the demo submission:

### 1. The type of data used within the application
TraceLink is designed to handle **end-to-end manufacturing supply chain and quality control data**, specifically tailored for automotive component manufacturing. The system processes six primary types of operational data:
*   **Supplier Master Data:** Information on approved vendors and their certification statuses.
*   **Raw Materials Logs:** Inward goods receipts, including material lots, supplier associations, quantities, and initial quality grades.
*   **Production Logs:** Shop-floor manufacturing records linking input material lots to output production batches, tracking machine IDs, shifts, and operators.
*   **QC Inspections:** Quality control checks on produced batches, tracking pass/fail metrics and specific defect categories (e.g., surface delamination, dimension mismatch).
*   **Dispatch Orders:** Outward logistics data tracking which production batches were shipped in which customer orders.
*   **Defect Complaints (CAPA):** Customer-reported issues, tracking the affected order, financial exposure (in INR), root causes, and corrective actions.

### 2. The data structure/schema required for importing data
The application supports high-throughput CSV ingestion. The data must be structured with specific headers for the pipeline to parse, validate, and sanitize the records into the SQLite backend. 

Here are the expected CSV column schemas for the primary entities:
*   **Raw Materials (`raw_materials_log.csv`)**: 
    `receipt_date`, `supplier_id`, `material_type`, `lot_number`, `quantity_kg`, `quality_grade`, `inspector_name`
*   **Production (`production_log.csv`)**: 
    `production_date`, `shift`, `machine_id`, `operator_id`, `input_lot_ref`, `batch_id`*(can be blank for AI imputation)*, `quantity_produced`, `scrap_quantity`
*   **QC Inspections (`qc_inspection.csv`)**: 
    `inspection_date`, `batch_id`, `pass_fail`, `defect_category`, `remarks`, `inspector_name`
*   **Dispatch (`dispatch_log.csv`)**: 
    `dispatch_date`, `order_id`, `customer_name`, `destination`, `batch_id_list`, `vehicle_number`
*   **Supplier Master (`supplier_master.csv`)**: 
    `supplier_id`, `supplier_name`, `category`, `contact_person`, `email`, `certification_status`
*   **Complaints (`defect_complaints.csv`)**: 
    `complaint_id`, `date_reported`, `customer_name`, `order_ref`, `defect_description`, `root_cause`, `financial_impact_inr`

*Note: The ingestion pipeline includes an automated sanitization layer that strips SQL injections, normalizes dates, and handles missing `batch_id` values via a 5-tier confidence imputation engine.*

### 3. Any sample datasets used during your testing and demonstrations
For testing and demonstration, the system utilizes augmented synthetic datasets containing roughly **40,000 to 50,000 rows per file** (located in the project's root/`Dummy Data` directory). 
These datasets are explicitly engineered to demonstrate the system's edge capabilities, including:
*   **Broken traceability links:** Missing `batch_id`s in the production logs to trigger the AI Imputation Engine.
*   **Cross-supplier anomalies:** Lots intentionally sourced from multiple simulated suppliers to trigger dashboard warnings.
*   **Sanitization stress-tests:** Data containing XSS payloads, SQL injection attempts (e.g., `'; DROP TABLE users; --`), and garbage values (`NaN`, `undefined`) to demonstrate the robust ingestion pipeline.

### 4. Instructions or prerequisites for setting up and evaluating the application
The application is built on a **FastAPI (Python)** backend and a **Vite + React 19** frontend, utilizing **Firebase** for authentication.

**Prerequisites:**
*   Python 3.11+
*   Node.js 18+ (or Bun)
*   A Firebase Project with Authentication enabled (Email/Password or Google).

**Setup Instructions:**
1.  **Backend Setup:**
    ```bash
    cd backend
    python -m venv .venv
    # Activate virtual environment (.venv\Scripts\activate on Windows)
    pip install -r requirements.txt
    ```
    *Ensure you place your Firebase `serviceAccountKey.json` inside the `backend/` folder for token verification.*
    ```bash
    # Start the backend API
    uvicorn app.main:app --reload --port 8000
    ```
2.  **Frontend Setup:**
    ```bash
    cd frontend
    npm install  # or bun install
    ```
    *Ensure your `.env` file in the `frontend` folder is populated with your `VITE_FIREBASE_*` credentials.*
    ```bash
    # Start the frontend UI
    npm run dev  # or bun run dev
    ```

**Evaluation Flow:**
1. Open the local frontend URL (usually `http://localhost:5173`).
2. Create an account using the Firebase authentication UI.
3. Navigate to the **Data Center / Import** tab on the sidebar.
4. Upload the sample CSV files (start with Suppliers, then Raw Materials, then Production, etc.).
5. Once imported, navigate to the **Dashboard** to view the auto-generated KPIs, or use the **Traceability** and **Alerts** screens to test forward/reverse supply chain tracing.
